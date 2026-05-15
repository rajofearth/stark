import type { Issue, RuntimeEvent, Settings, WorkerHost } from "./types.js";
import type { TrackerAdapter } from "./tracker/index.js";
import type { WorkspaceManager } from "./workspace/workspace.js";
import type { WorkflowStore } from "./workflow/workflow.js";
import type { CodexAppServer } from "./codex/appServer.js";
import type { Logger } from "./logging/logger.js";
import { buildPrompt, type PromptContext } from "./promptBuilder.js";
import { normalizeIssueState } from "./config/schema.js";
import { buildContinuationPrompt } from "./workflow/linearOrchestration.js";
import type { TaskKind } from "./types.js";

export class AgentRunner {
  constructor(
    private settingsProvider: () => Settings,
    private readonly workflowStore: WorkflowStore,
    private readonly workspaceManager: WorkspaceManager,
    private readonly tracker: TrackerAdapter,
    private readonly codex: CodexAppServer,
    private readonly logger: Logger,
  ) {}

  async run(
    issue: Issue,
    options: {
      attempt: number | null;
      workerHost: WorkerHost;
      refreshIssueAfterTurn?: boolean;
      taskKind?: TaskKind;
      signal: AbortSignal;
      onEvent: (event: RuntimeEvent) => void;
      onRuntimeInfo: (info: { workerHost: WorkerHost; workspacePath: string }) => void;
    },
  ): Promise<Issue> {
    const workerHost = options.workerHost ?? this.selectedWorkerHost();
    this.logger.info("Starting worker attempt", {
      issue_id: issue.id,
      issue_identifier: issue.identifier,
      worker_host: workerHost ?? "local",
    });
    const workspace = await this.workspaceManager.createForIssue(issue, workerHost);
    options.onRuntimeInfo({ workerHost, workspacePath: workspace.path });
    try {
      await this.workspaceManager.runBeforeRun(workspace.path, issue, workerHost);
      return await this.runCodexTurns(
        workspace.path,
        issue,
        options.attempt,
        workerHost,
        options.signal,
        options.onEvent,
        options.refreshIssueAfterTurn ?? true,
        options.taskKind ?? "linear",
      );
    } finally {
      await this.workspaceManager.runAfterRun(workspace.path, issue, workerHost);
    }
  }

  private async runCodexTurns(
    workspacePath: string,
    initialIssue: Issue,
    attempt: number | null,
    workerHost: WorkerHost,
    signal: AbortSignal,
    onEvent: (event: RuntimeEvent) => void,
    refreshIssueAfterTurn: boolean,
    taskKind: TaskKind,
  ): Promise<Issue> {
    const session = await this.codex.startSession(workspacePath, workerHost);
    const settings = this.settingsProvider();
    const promptContext: PromptContext = {
      taskKind,
      linearOrchestration: settings.agent.linearOrchestration,
    };
    try {
      let issue = initialIssue;
      if (!this.isRunnable(issue.state)) return issue;
      const maxTurns = settings.agent.maxTurns;
      for (let turn = 1; turn <= maxTurns; turn += 1) {
        if (signal.aborted) throw new Error("worker_cancelled");
        const prompt =
          turn === 1
            ? await buildPrompt(await this.workflowStore.current(), issue, attempt, promptContext)
            : buildContinuationPrompt(
                taskKind,
                issue.state,
                turn,
                maxTurns,
                settings.agent.linearOrchestration,
              );
        await this.codex.runTurn(session, prompt, issue, onEvent);
        if (!refreshIssueAfterTurn) {
          return { ...issue, state: "Human Review", updatedAt: new Date() };
        }
        const refreshed = await this.tracker.fetchIssueStatesByIds([issue.id]);
        issue = refreshed[0] ?? issue;
        if (!this.isRunnable(issue.state)) return issue;
      }
      this.logger.info("Reached agent.max_turns with issue still active", {
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        max_turns: maxTurns,
      });
      return issue;
    } finally {
      this.codex.stopSession(session);
    }
  }

  private isRunnable(state: string): boolean {
    const active = new Set(this.settingsProvider().tracker.activeStates.map(normalizeIssueState));
    const normalized = normalizeIssueState(state);
    return active.has(normalized) && !isHumanReviewState(normalized);
  }

  private selectedWorkerHost(): WorkerHost {
    return this.settingsProvider().worker.sshHosts[0] ?? null;
  }
}

function isHumanReviewState(normalizedState: string): boolean {
  return normalizedState === "human review";
}
