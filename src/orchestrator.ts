import { EventEmitter } from "node:events";
import type { AgentRunner } from "./agentRunner.js";
import { normalizeIssueState, validateDispatchSettings } from "./config/schema.js";
import type { Logger } from "./logging/logger.js";
import type { TrackerAdapter } from "./tracker/index.js";
import type {
  Issue,
  RetryEntry,
  RunningEntry,
  RuntimeEvent,
  Settings,
  TokenTotals,
  WorkerHost,
} from "./types.js";
import type { WorkspaceManager } from "./workspace/workspace.js";

const continuationRetryDelayMs = 1_000;
const failureRetryBaseMs = 10_000;
const maxRecentEvents = 200;

interface RecentEvent {
  at: string;
  event: string;
  issue_id: string | null;
  issue_identifier: string | null;
  message: string;
  session_id?: string | null;
  worker_host?: string | null;
}

export class Orchestrator extends EventEmitter {
  pollIntervalMs = 30_000;
  maxConcurrentAgents = 10;
  nextPollDueAtMs: number | null = null;
  pollCheckInProgress = false;
  running = new Map<string, RunningEntry>();
  claimed = new Set<string>();
  completed = new Set<string>();
  retryAttempts = new Map<string, RetryEntry>();
  codexTotals: TokenTotals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 };
  codexRateLimits: unknown = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private recentEvents: RecentEvent[] = [];

  constructor(
    private settingsProvider: () => Settings,
    private readonly tracker: TrackerAdapter,
    private readonly workspaceManager: WorkspaceManager,
    private readonly agentRunner: AgentRunner,
    private readonly logger: Logger,
  ) {
    super();
  }

  async start(): Promise<void> {
    this.refreshRuntimeConfig();
    validateDispatchSettings(this.settingsProvider());
    await this.startupTerminalWorkspaceCleanup();
    this.scheduleTick(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    for (const entry of this.running.values()) entry.abortController.abort();
    for (const retry of this.retryAttempts.values()) clearTimeout(retry.timer);
  }

  requestRefresh(): Record<string, unknown> {
    const coalesced = this.pollCheckInProgress;
    this.scheduleTick(0);
    return {
      queued: true,
      coalesced,
      requested_at: new Date().toISOString(),
      operations: ["poll", "reconcile"],
    };
  }

  snapshot(): Record<string, unknown> {
    const now = Date.now();
    return {
      generated_at: new Date().toISOString(),
      health: {
        polling: this.pollCheckInProgress ? "checking_now" : "waiting",
        next_poll_due_at: this.nextPollDueAtMs
          ? new Date(this.nextPollDueAtMs).toISOString()
          : null,
        poll_interval_ms: this.pollIntervalMs,
        max_concurrent_agents: this.maxConcurrentAgents,
        available_slots: this.availableSlots(),
      },
      counts: {
        running: this.running.size,
        retrying: this.retryAttempts.size,
        completed: this.completed.size,
        claimed: this.claimed.size,
      },
      running: [...this.running.values()].map((entry) => ({
        issue_id: entry.issue.id,
        issue_identifier: entry.identifier,
        state: entry.issue.state,
        session_id: entry.sessionId,
        turn_count: entry.turnCount,
        last_event: entry.lastCodexEvent,
        last_message: entry.lastCodexMessage,
        started_at: entry.startedAt.toISOString(),
        last_event_at: entry.lastCodexTimestamp?.toISOString() ?? null,
        worker_host: entry.workerHost,
        workspace_path: entry.workspacePath,
        tokens: {
          input_tokens: entry.codexInputTokens,
          output_tokens: entry.codexOutputTokens,
          total_tokens: entry.codexTotalTokens,
        },
      })),
      retrying: [...this.retryAttempts.values()].map((entry) => ({
        issue_id: entry.issueId,
        issue_identifier: entry.identifier,
        attempt: entry.attempt,
        due_at: new Date(entry.dueAtMs).toISOString(),
        due_in_ms: Math.max(0, entry.dueAtMs - now),
        error: entry.error,
        worker_host: entry.workerHost,
      })),
      codex_totals: {
        input_tokens: this.codexTotals.inputTokens,
        output_tokens: this.codexTotals.outputTokens,
        total_tokens: this.codexTotals.totalTokens,
        seconds_running: this.codexTotals.secondsRunning + this.activeRuntimeSeconds(),
      },
      rate_limits: this.codexRateLimits,
      recent_events: this.recentEvents.slice(0, 50),
    };
  }

  issueSnapshot(identifier: string): Record<string, unknown> | null {
    const running = [...this.running.values()].find((entry) => entry.identifier === identifier);
    const retry = [...this.retryAttempts.values()].find((entry) => entry.identifier === identifier);
    if (!running && !retry) return null;
    return {
      issue_identifier: identifier,
      issue_id: running?.issue.id ?? retry?.issueId ?? null,
      status: running ? "running" : "retrying",
      workspace: { path: running?.workspacePath ?? retry?.workspacePath ?? null },
      running: running
        ? (this.snapshot().running as Array<Record<string, unknown>>).find(
            (row) => row.issue_identifier === identifier,
          )
        : null,
      retry: retry
        ? {
            attempt: retry.attempt,
            due_at: new Date(retry.dueAtMs).toISOString(),
            error: retry.error,
          }
        : null,
      recent_events: this.recentEvents
        .filter((event) => event.issue_identifier === identifier)
        .slice(0, 25),
      last_error: retry?.error ?? null,
      tracked: {},
    };
  }

  private scheduleTick(delayMs: number): void {
    if (this.stopped) return;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.nextPollDueAtMs = Date.now() + delayMs;
    this.tickTimer = setTimeout(() => void this.pollCycle(), delayMs);
  }

  private async pollCycle(): Promise<void> {
    if (this.stopped) return;
    this.refreshRuntimeConfig();
    this.pollCheckInProgress = true;
    this.emit("updated");
    try {
      await this.reconcileRunningIssues();
      validateDispatchSettings(this.settingsProvider());
      const issues = await this.tracker.fetchCandidateIssues();
      for (const issue of sortIssuesForDispatch(issues)) {
        if (this.availableSlots() <= 0) break;
        if (this.shouldDispatch(issue)) this.dispatchIssue(issue, null, null);
      }
    } catch (reason) {
      this.logger.error("Poll cycle failed", {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
    } finally {
      this.pollCheckInProgress = false;
      this.emit("updated");
      this.scheduleTick(this.pollIntervalMs);
    }
  }

  private dispatchIssue(
    issue: Issue,
    attempt: number | null,
    preferredWorkerHost: WorkerHost,
  ): void {
    if (this.claimed.has(issue.id) || this.running.has(issue.id)) return;
    const workerHost = this.selectWorkerHost(preferredWorkerHost);
    if (workerHost === "no_worker_capacity") return;
    const abortController = new AbortController();
    const entry: RunningEntry = {
      issue,
      identifier: issue.identifier,
      abortController,
      startedAt: new Date(),
      retryAttempt: attempt,
      sessionId: null,
      threadId: null,
      turnId: null,
      codexAppServerPid: null,
      lastCodexEvent: null,
      lastCodexTimestamp: null,
      lastCodexMessage: null,
      codexInputTokens: 0,
      codexOutputTokens: 0,
      codexTotalTokens: 0,
      lastReportedInputTokens: 0,
      lastReportedOutputTokens: 0,
      lastReportedTotalTokens: 0,
      turnCount: 0,
      workerHost: workerHost === null ? null : workerHost,
      workspacePath: null,
    };
    this.running.set(issue.id, entry);
    this.claimed.add(issue.id);
    const retry = this.retryAttempts.get(issue.id);
    if (retry) clearTimeout(retry.timer);
    this.retryAttempts.delete(issue.id);
    this.agentRunner
      .run(issue, {
        attempt,
        workerHost: workerHost === null ? null : workerHost,
        signal: abortController.signal,
        onRuntimeInfo: (info) => {
          const current = this.running.get(issue.id);
          if (current) {
            current.workerHost = info.workerHost;
            current.workspacePath = info.workspacePath;
            this.recordEvent("workspace_ready", issue, `Workspace ready at ${info.workspacePath}`, {
              workerHost: info.workerHost,
            });
            this.emit("updated");
          }
        },
        onEvent: (event) => this.integrateCodexUpdate(issue.id, event),
      })
      .then(() => this.handleWorkerExit(issue.id, "normal"))
      .catch((reason) =>
        this.handleWorkerExit(issue.id, reason instanceof Error ? reason.message : String(reason)),
      );
    this.logger.info("Dispatching issue to agent", {
      issue_id: issue.id,
      issue_identifier: issue.identifier,
      attempt: attempt ?? "first",
      worker_host: workerHost ?? "local",
    });
    this.recordEvent(
      "dispatch",
      issue,
      `Dispatched ${issue.identifier} to ${workerHost ?? "local"}`,
      {
        workerHost: workerHost === null ? null : workerHost,
      },
    );
  }

  private handleWorkerExit(issueId: string, reason: "normal" | string): void {
    const entry = this.running.get(issueId);
    if (!entry) return;
    this.recordSessionCompletionTotals(entry);
    this.running.delete(issueId);
    if (reason === "normal") {
      this.completed.add(issueId);
      this.scheduleIssueRetry(issueId, 1, {
        identifier: entry.identifier,
        delayType: "continuation",
        workerHost: entry.workerHost,
        workspacePath: entry.workspacePath,
      });
    } else {
      this.scheduleIssueRetry(issueId, nextRetryAttempt(entry), {
        identifier: entry.identifier,
        error: `agent exited: ${reason}`,
        workerHost: entry.workerHost,
        workspacePath: entry.workspacePath,
      });
    }
    this.recordEvent(
      reason === "normal" ? "worker_completed" : "worker_failed",
      entry.issue,
      reason === "normal"
        ? "Worker completed; scheduling continuation check"
        : `Worker failed: ${reason}`,
      { sessionId: entry.sessionId, workerHost: entry.workerHost },
    );
    this.emit("updated");
  }

  private async reconcileRunningIssues(): Promise<void> {
    this.reconcileStalledRuns();
    const ids = [...this.running.keys()];
    if (ids.length === 0) return;
    let issues: Issue[];
    try {
      issues = await this.tracker.fetchIssueStatesByIds(ids);
    } catch (reason) {
      this.logger.debug("Failed to refresh running issue states; keeping active workers", {
        reason: String(reason),
      });
      return;
    }
    const visible = new Set(issues.map((issue) => issue.id));
    for (const issue of issues) {
      if (this.isTerminal(issue.state)) await this.terminateRunningIssue(issue.id, true);
      else if (!issue.assignedToWorker) await this.terminateRunningIssue(issue.id, false);
      else if (this.isActive(issue.state)) {
        const entry = this.running.get(issue.id);
        if (entry) entry.issue = issue;
      } else {
        await this.terminateRunningIssue(issue.id, false);
      }
    }
    for (const id of ids) {
      if (!visible.has(id)) await this.terminateRunningIssue(id, false);
    }
  }

  private reconcileStalledRuns(): void {
    const timeoutMs = this.settingsProvider().codex.stallTimeoutMs;
    if (timeoutMs <= 0) return;
    const now = Date.now();
    for (const [issueId, entry] of this.running.entries()) {
      const last = (entry.lastCodexTimestamp ?? entry.startedAt).getTime();
      const elapsed = now - last;
      if (elapsed > timeoutMs) {
        entry.abortController.abort();
        this.running.delete(issueId);
        this.scheduleIssueRetry(issueId, nextRetryAttempt(entry), {
          identifier: entry.identifier,
          error: `stalled for ${elapsed}ms without codex activity`,
          workerHost: entry.workerHost,
          workspacePath: entry.workspacePath,
        });
        this.recordEvent(
          "worker_stalled",
          entry.issue,
          `Stalled for ${elapsed}ms; scheduled retry`,
          {
            sessionId: entry.sessionId,
            workerHost: entry.workerHost,
          },
        );
      }
    }
  }

  private async terminateRunningIssue(issueId: string, cleanupWorkspace: boolean): Promise<void> {
    const entry = this.running.get(issueId);
    if (!entry) {
      this.claimed.delete(issueId);
      return;
    }
    this.recordSessionCompletionTotals(entry);
    entry.abortController.abort();
    this.running.delete(issueId);
    this.claimed.delete(issueId);
    const retry = this.retryAttempts.get(issueId);
    if (retry) clearTimeout(retry.timer);
    this.retryAttempts.delete(issueId);
    if (cleanupWorkspace)
      await this.workspaceManager.removeIssueWorkspaces(entry.identifier, entry.workerHost);
    this.recordEvent(
      cleanupWorkspace ? "terminated_terminal" : "terminated_non_active",
      entry.issue,
      cleanupWorkspace
        ? "Stopped run and cleaned workspace"
        : "Stopped run without workspace cleanup",
      { sessionId: entry.sessionId, workerHost: entry.workerHost },
    );
  }

  private scheduleIssueRetry(
    issueId: string,
    attempt: number,
    metadata: {
      identifier: string;
      delayType?: "continuation";
      error?: string;
      workerHost?: WorkerHost;
      workspacePath?: string | null;
    },
  ): void {
    const existing = this.retryAttempts.get(issueId);
    if (existing) clearTimeout(existing.timer);
    const delay =
      metadata.delayType === "continuation"
        ? continuationRetryDelayMs
        : Math.min(
            failureRetryBaseMs * 2 ** Math.max(0, attempt - 1),
            this.settingsProvider().agent.maxRetryBackoffMs,
          );
    const dueAtMs = Date.now() + delay;
    const timer = setTimeout(() => void this.handleRetry(issueId), delay);
    this.retryAttempts.set(issueId, {
      issueId,
      identifier: metadata.identifier,
      attempt,
      dueAtMs,
      timer,
      error: metadata.error ?? null,
      workerHost: metadata.workerHost ?? null,
      workspacePath: metadata.workspacePath ?? null,
    });
    this.claimed.add(issueId);
    this.recordEvent(
      "retry_scheduled",
      null,
      `Scheduled retry for ${metadata.identifier} attempt ${attempt}`,
      {
        issueId,
        issueIdentifier: metadata.identifier,
        workerHost: metadata.workerHost ?? null,
      },
    );
  }

  private async handleRetry(issueId: string): Promise<void> {
    const retry = this.retryAttempts.get(issueId);
    if (!retry) return;
    this.retryAttempts.delete(issueId);
    try {
      const candidates = await this.tracker.fetchCandidateIssues();
      const issue = candidates.find((candidate) => candidate.id === issueId);
      if (!issue || !this.shouldDispatch(issue)) {
        this.claimed.delete(issueId);
        this.recordEvent(
          "retry_released",
          null,
          `Released ${retry.identifier}; no longer dispatchable`,
          {
            issueId,
            issueIdentifier: retry.identifier,
            workerHost: retry.workerHost,
          },
        );
        return;
      }
      if (this.availableSlots() === 0) {
        this.scheduleIssueRetry(issueId, retry.attempt + 1, {
          identifier: retry.identifier,
          error: "no available orchestrator slots",
          workerHost: retry.workerHost,
          workspacePath: retry.workspacePath,
        });
        return;
      }
      this.claimed.delete(issueId);
      this.recordEvent(
        "retry_dispatch",
        issue,
        `Retrying ${issue.identifier} attempt ${retry.attempt}`,
        {
          workerHost: retry.workerHost,
        },
      );
      this.dispatchIssue(issue, retry.attempt, retry.workerHost);
    } catch (reason) {
      this.scheduleIssueRetry(issueId, retry.attempt + 1, {
        identifier: retry.identifier,
        error: `retry poll failed: ${String(reason)}`,
        workerHost: retry.workerHost,
        workspacePath: retry.workspacePath,
      });
    }
  }

  private shouldDispatch(issue: Issue): boolean {
    return (
      !!issue.id &&
      !!issue.identifier &&
      !!issue.title &&
      this.isActive(issue.state) &&
      !this.isTerminal(issue.state) &&
      !this.claimed.has(issue.id) &&
      !this.running.has(issue.id) &&
      issue.assignedToWorker !== false &&
      !todoBlockedByNonTerminal(issue, this.terminalStates()) &&
      this.availableSlots() > 0 &&
      this.stateSlotsAvailable(issue) &&
      this.selectWorkerHost(null) !== "no_worker_capacity"
    );
  }

  private availableSlots(): number {
    return Math.max(this.maxConcurrentAgents - this.running.size, 0);
  }

  private stateSlotsAvailable(issue: Issue): boolean {
    const normalized = normalizeIssueState(issue.state);
    const limit =
      this.settingsProvider().agent.maxConcurrentAgentsByState[normalized] ??
      this.maxConcurrentAgents;
    const used = [...this.running.values()].filter(
      (entry) => normalizeIssueState(entry.issue.state) === normalized,
    ).length;
    return limit > used;
  }

  private selectWorkerHost(preferred: WorkerHost): WorkerHost | "no_worker_capacity" {
    const hosts = this.settingsProvider().worker.sshHosts;
    if (preferred) return preferred;
    if (hosts.length === 0) return null;
    const cap = this.settingsProvider().worker.maxConcurrentAgentsPerHost;
    for (const host of hosts) {
      const used = [...this.running.values()].filter((entry) => entry.workerHost === host).length;
      if (!cap || used < cap) return host;
    }
    return "no_worker_capacity";
  }

  private integrateCodexUpdate(issueId: string, update: RuntimeEvent): void {
    const entry = this.running.get(issueId);
    if (!entry) return;
    entry.lastCodexEvent = update.event;
    entry.lastCodexTimestamp = new Date(update.timestamp);
    entry.lastCodexMessage = summarize(update.payload);
    entry.sessionId = update.sessionId ?? entry.sessionId;
    entry.threadId = update.threadId ?? entry.threadId;
    entry.turnId = update.turnId ?? entry.turnId;
    entry.codexAppServerPid = update.codexAppServerPid ?? entry.codexAppServerPid;
    if (update.event === "session_started") entry.turnCount += 1;
    const totals = extractAbsoluteTokenTotals(update.payload);
    if (totals) {
      const inputDelta = Math.max(0, totals.inputTokens - entry.lastReportedInputTokens);
      const outputDelta = Math.max(0, totals.outputTokens - entry.lastReportedOutputTokens);
      const totalDelta = Math.max(0, totals.totalTokens - entry.lastReportedTotalTokens);
      entry.lastReportedInputTokens = totals.inputTokens;
      entry.lastReportedOutputTokens = totals.outputTokens;
      entry.lastReportedTotalTokens = totals.totalTokens;
      entry.codexInputTokens = totals.inputTokens;
      entry.codexOutputTokens = totals.outputTokens;
      entry.codexTotalTokens = totals.totalTokens;
      this.codexTotals.inputTokens += inputDelta;
      this.codexTotals.outputTokens += outputDelta;
      this.codexTotals.totalTokens += totalDelta;
    }
    const rateLimits = extractRateLimits(update.payload);
    if (rateLimits) this.codexRateLimits = rateLimits;
    this.recordEvent(update.event, entry.issue, update.event, {
      sessionId: entry.sessionId,
      workerHost: entry.workerHost,
    });
    this.emit("updated");
  }

  private recordEvent(
    event: string,
    issue: Issue | null,
    message: string,
    metadata: {
      issueId?: string | null;
      issueIdentifier?: string | null;
      sessionId?: string | null;
      workerHost?: string | null;
    } = {},
  ): void {
    this.recentEvents.unshift({
      at: new Date().toISOString(),
      event,
      issue_id: issue?.id ?? metadata.issueId ?? null,
      issue_identifier: issue?.identifier ?? metadata.issueIdentifier ?? null,
      message,
      session_id: metadata.sessionId,
      worker_host: metadata.workerHost,
    });
    this.recentEvents = this.recentEvents.slice(0, maxRecentEvents);
  }

  private recordSessionCompletionTotals(entry: RunningEntry): void {
    this.codexTotals.secondsRunning += Math.max(0, (Date.now() - entry.startedAt.getTime()) / 1000);
  }

  private activeRuntimeSeconds(): number {
    const now = Date.now();
    return [...this.running.values()].reduce(
      (sum, entry) => sum + Math.max(0, (now - entry.startedAt.getTime()) / 1000),
      0,
    );
  }

  private refreshRuntimeConfig(): void {
    const settings = this.settingsProvider();
    this.pollIntervalMs = settings.polling.intervalMs;
    this.maxConcurrentAgents = settings.agent.maxConcurrentAgents;
  }

  private async startupTerminalWorkspaceCleanup(): Promise<void> {
    try {
      for (const issue of await this.tracker.fetchIssuesByStates(
        this.settingsProvider().tracker.terminalStates,
      )) {
        await this.workspaceManager.removeIssueWorkspaces(issue.identifier);
      }
    } catch (reason) {
      this.logger.warn("Startup terminal workspace cleanup failed", { reason: String(reason) });
    }
  }

  private isActive(state: string): boolean {
    return new Set(this.settingsProvider().tracker.activeStates.map(normalizeIssueState)).has(
      normalizeIssueState(state),
    );
  }

  private isTerminal(state: string): boolean {
    return this.terminalStates().has(normalizeIssueState(state));
  }

  private terminalStates(): Set<string> {
    return new Set(this.settingsProvider().tracker.terminalStates.map(normalizeIssueState));
  }
}

export function sortIssuesForDispatch(issues: Issue[]): Issue[] {
  return [...issues].sort((left, right) => {
    const leftKey = sortKey(left);
    const rightKey = sortKey(right);
    return (
      leftKey.priority - rightKey.priority ||
      leftKey.createdAt - rightKey.createdAt ||
      leftKey.identifier.localeCompare(rightKey.identifier)
    );
  });
}

function sortKey(issue: Issue): { priority: number; createdAt: number; identifier: string } {
  return {
    priority: issue.priority && issue.priority >= 1 && issue.priority <= 4 ? issue.priority : 5,
    createdAt: issue.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
    identifier: issue.identifier ?? issue.id ?? "",
  };
}

function todoBlockedByNonTerminal(issue: Issue, terminalStates: Set<string>): boolean {
  return (
    normalizeIssueState(issue.state) === "todo" &&
    issue.blockedBy.some(
      (blocker) => !blocker.state || !terminalStates.has(normalizeIssueState(blocker.state)),
    )
  );
}

function nextRetryAttempt(entry: RunningEntry): number {
  return (entry.retryAttempt ?? 0) + 1;
}

function summarize(payload: unknown): string | null {
  if (!payload) return null;
  const text = JSON.stringify(payload);
  return text.length <= 500 ? text : `${text.slice(0, 500)}...`;
}

function extractAbsoluteTokenTotals(
  payload: unknown,
): { inputTokens: number; outputTokens: number; totalTokens: number } | null {
  const tokenUsage =
    getPath<Record<string, unknown>>(payload, ["params", "tokenUsage", "total"]) ??
    getPath<Record<string, unknown>>(payload, ["tokenUsage", "total"]) ??
    getPath<Record<string, unknown>>(payload, ["info", "total_token_usage"]);
  if (!tokenUsage) return null;
  const inputTokens = numberFrom(tokenUsage.input_tokens ?? tokenUsage.inputTokens);
  const outputTokens = numberFrom(tokenUsage.output_tokens ?? tokenUsage.outputTokens);
  const totalTokens =
    numberFrom(tokenUsage.total_tokens ?? tokenUsage.totalTokens) ??
    (inputTokens ?? 0) + (outputTokens ?? 0);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? 0,
  };
}

function extractRateLimits(payload: unknown): unknown {
  return getPath(payload, ["params", "rateLimits"]) ?? getPath(payload, ["rateLimits"]);
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPath<T>(value: unknown, path: string[]): T | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T;
}
