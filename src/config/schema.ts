import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { Settings } from "../types.js";
import { normalizeLinearOrchestration } from "../workflow/linearOrchestration.js";

const stringArray = z.array(z.string());
const stringOrRecord = z.union([z.string(), z.record(z.string(), z.unknown())]);

const rawConfigSchema = z
  .object({
    tracker: z
      .object({
        kind: z.string().nullable().optional(),
        endpoint: z.string().optional(),
        api_key: z.string().nullable().optional(),
        project_slug: z.string().nullable().optional(),
        assignee: z.string().nullable().optional(),
        active_states: stringArray.optional(),
        terminal_states: stringArray.optional(),
        comment_reply_states: stringArray.optional(),
      })
      .passthrough()
      .optional(),
    polling: z
      .object({
        interval_ms: z.number().int().positive().optional(),
      })
      .passthrough()
      .optional(),
    workspace: z
      .object({
        root: z.string().optional(),
      })
      .passthrough()
      .optional(),
    worker: z
      .object({
        ssh_hosts: stringArray.optional(),
        max_concurrent_agents_per_host: z.number().int().positive().nullable().optional(),
      })
      .passthrough()
      .optional(),
    agent: z
      .object({
        max_concurrent_agents: z.number().int().positive().optional(),
        max_turns: z.number().int().positive().optional(),
        max_retry_backoff_ms: z.number().int().positive().optional(),
        max_concurrent_agents_by_state: z.record(z.string(), z.unknown()).optional(),
        linear_orchestration: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    codex: z
      .object({
        command: z.string().min(1).optional(),
        approval_policy: stringOrRecord.optional(),
        thread_sandbox: z.string().optional(),
        turn_sandbox_policy: z.record(z.string(), z.unknown()).nullable().optional(),
        turn_timeout_ms: z.number().int().positive().optional(),
        read_timeout_ms: z.number().int().positive().optional(),
        stall_timeout_ms: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    hooks: z
      .object({
        after_create: z.string().nullable().optional(),
        before_run: z.string().nullable().optional(),
        after_run: z.string().nullable().optional(),
        before_remove: z.string().nullable().optional(),
        timeout_ms: z.number().int().positive().optional(),
      })
      .passthrough()
      .optional(),
    observability: z
      .object({
        dashboard_enabled: z.boolean().optional(),
        refresh_ms: z.number().int().positive().optional(),
        render_interval_ms: z.number().int().positive().optional(),
      })
      .passthrough()
      .optional(),
    server: z
      .object({
        port: z.number().int().nonnegative().nullable().optional(),
        host: z.string().optional(),
      })
      .passthrough()
      .optional(),
    slack: z
      .object({
        enabled: z.boolean().optional(),
        bot_token: z.string().nullable().optional(),
        signing_secret: z.string().nullable().optional(),
        allowed_channel_ids: stringArray.optional(),
        allowed_user_ids: stringArray.optional(),
        public_base_url: z.string().nullable().optional(),
        command_name: z.string().min(1).optional(),
        artifact_roots: stringArray.optional(),
        require_approval_for: stringArray.optional(),
      })
      .passthrough()
      .optional(),
    github: z
      .object({
        enabled: z.boolean().optional(),
        allowed_repo_roots: stringArray.optional(),
        pr_timeout_ms: z.number().int().positive().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export class ConfigError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
  }
}

export function parseSettings(
  rawConfig: Record<string, unknown>,
  workflowPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Settings {
  const normalizedRaw = normalizeKeys(rawConfig);
  const parsed = rawConfigSchema.safeParse(normalizedRaw);
  if (!parsed.success) {
    throw new ConfigError("invalid_workflow_config", zodMessage(parsed.error), parsed.error);
  }

  const config = parsed.data;
  const tracker = config.tracker ?? {};
  const polling = config.polling ?? {};
  const workspace = config.workspace ?? {};
  const worker = config.worker ?? {};
  const agent = config.agent ?? {};
  const codex = config.codex ?? {};
  const hooks = config.hooks ?? {};
  const observability = config.observability ?? {};
  const server = config.server ?? {};
  const slack = config.slack ?? {};
  const github = config.github ?? {};

  const settings: Settings = {
    tracker: {
      kind: tracker.kind ?? null,
      endpoint: tracker.endpoint ?? "https://api.linear.app/graphql",
      apiKey: resolveSecretSetting(tracker.api_key, env.LINEAR_API_KEY, env),
      projectSlug: normalizeOptionalString(tracker.project_slug),
      assignee: resolveSecretSetting(tracker.assignee, env.LINEAR_ASSIGNEE, env),
      activeStates: tracker.active_states ?? ["Todo", "In Progress"],
      terminalStates: tracker.terminal_states ?? [
        "Closed",
        "Cancelled",
        "Canceled",
        "Duplicate",
        "Done",
      ],
      commentReplyStates: tracker.comment_reply_states ?? [],
    },
    polling: { intervalMs: polling.interval_ms ?? 30_000 },
    workspace: {
      root: resolveWorkspaceRoot(
        workspace.root ?? resolve(tmpdir(), "symphony_workspaces"),
        workflowPath,
        env,
      ),
    },
    worker: {
      sshHosts: (worker.ssh_hosts ?? []).map((host) => host.trim()).filter(Boolean),
      maxConcurrentAgentsPerHost: worker.max_concurrent_agents_per_host ?? null,
    },
    agent: {
      maxConcurrentAgents: agent.max_concurrent_agents ?? 10,
      maxTurns: agent.max_turns ?? 20,
      maxRetryBackoffMs: agent.max_retry_backoff_ms ?? 300_000,
      maxConcurrentAgentsByState: normalizeStateLimits(agent.max_concurrent_agents_by_state),
      linearOrchestration: normalizeLinearOrchestration(agent.linear_orchestration),
    },
    codex: {
      command: codex.command ?? "codex app-server",
      approvalPolicy: codex.approval_policy ?? {
        reject: { sandbox_approval: true, rules: true, mcp_elicitations: true },
      },
      threadSandbox: codex.thread_sandbox ?? "workspace-write",
      turnSandboxPolicy: codex.turn_sandbox_policy ?? null,
      turnTimeoutMs: codex.turn_timeout_ms ?? 3_600_000,
      readTimeoutMs: codex.read_timeout_ms ?? 5_000,
      stallTimeoutMs: codex.stall_timeout_ms ?? 300_000,
    },
    hooks: {
      afterCreate: hooks.after_create ?? null,
      beforeRun: hooks.before_run ?? null,
      afterRun: hooks.after_run ?? null,
      beforeRemove: hooks.before_remove ?? null,
      timeoutMs: hooks.timeout_ms ?? 60_000,
    },
    observability: {
      dashboardEnabled: observability.dashboard_enabled ?? true,
      refreshMs: observability.refresh_ms ?? 1_000,
      renderIntervalMs: observability.render_interval_ms ?? 16,
    },
    server: {
      port: server.port === undefined ? 4000 : server.port,
      host: server.host ?? "127.0.0.1",
    },
    slack: {
      enabled:
        slack.enabled ??
        booleanFromEnv(env.STARK_SLACK_ENABLED) ??
        Boolean(env.SLACK_BOT_TOKEN && env.SLACK_SIGNING_SECRET),
      botToken: resolveSecretSetting(slack.bot_token, env.SLACK_BOT_TOKEN, env),
      signingSecret: resolveSecretSetting(slack.signing_secret, env.SLACK_SIGNING_SECRET, env),
      allowedChannelIds: splitEnvList(slack.allowed_channel_ids, env.SLACK_ALLOWED_CHANNELS),
      allowedUserIds: splitEnvList(slack.allowed_user_ids, env.SLACK_ALLOWED_USERS),
      publicBaseUrl: resolveSecretSetting(slack.public_base_url, env.STARK_PUBLIC_BASE_URL, env),
      commandName: slack.command_name ?? "/stark",
      artifactRoots: resolvePathList(
        splitEnvList(slack.artifact_roots, env.STARK_ARTIFACT_ROOTS),
        workflowPath,
        env,
      ),
      requireApprovalFor: slack.require_approval_for ?? [
        "artifact_upload",
        "github_pr",
        "new_project",
      ],
    },
    github: {
      enabled: github.enabled ?? false,
      allowedRepoRoots: resolvePathList(
        splitEnvList(github.allowed_repo_roots, env.STARK_GITHUB_REPO_ROOTS),
        workflowPath,
        env,
      ),
      prTimeoutMs: github.pr_timeout_ms ?? 120_000,
    },
  };

  return settings;
}

export function validateDispatchSettings(settings: Settings): void {
  if (!settings.tracker.kind) {
    throw new ConfigError("missing_tracker_kind", "Tracker kind missing in WORKFLOW.md");
  }
  if (!["linear", "memory"].includes(settings.tracker.kind)) {
    throw new ConfigError(
      "unsupported_tracker_kind",
      `Unsupported tracker kind in WORKFLOW.md: ${settings.tracker.kind}`,
    );
  }
  if (settings.tracker.kind === "linear" && !settings.tracker.apiKey) {
    throw new ConfigError("missing_linear_api_token", "Linear API token missing in WORKFLOW.md");
  }
  if (settings.tracker.kind === "linear" && !settings.tracker.projectSlug) {
    throw new ConfigError(
      "missing_linear_project_slug",
      "Linear project slug missing in WORKFLOW.md",
    );
  }
  if (!settings.codex.command) {
    throw new ConfigError("missing_codex_command", "Codex command missing in WORKFLOW.md");
  }
  if (settings.slack.enabled) {
    if (!settings.slack.botToken) {
      throw new ConfigError("missing_slack_bot_token", "Slack bot token missing in WORKFLOW.md");
    }
    if (!settings.slack.signingSecret) {
      throw new ConfigError(
        "missing_slack_signing_secret",
        "Slack signing secret missing in WORKFLOW.md",
      );
    }
  }
}

export function normalizeIssueState(stateName: string): string {
  return stateName.trim().toLowerCase();
}

export function isTerminalIssueState(state: string, terminalStates: string[]): boolean {
  const normalized = normalizeIssueState(state);
  return new Set(terminalStates.map(normalizeIssueState)).has(normalized);
}

export function runtimeTurnSandboxPolicy(
  settings: Settings,
  workspacePath?: string,
): Record<string, unknown> {
  if (settings.codex.turnSandboxPolicy) return settings.codex.turnSandboxPolicy;
  return {
    type: "workspaceWrite",
    writableRoots: [workspacePath ?? settings.workspace.root],
    readOnlyAccess: { type: "fullAccess" },
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function normalizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, normalizeKeys(nested)]),
  );
}

function resolveSecretSetting(
  value: string | null | undefined,
  fallback: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const resolved =
    value === undefined || value === null ? fallback : resolveEnvReference(value, fallback, env);
  return resolved && resolved !== "" ? resolved : null;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  return value && value !== "" ? value : null;
}

function splitEnvList(configured: string[] | undefined, envValue: string | undefined): string[] {
  const values = configured ?? envValue?.split(",") ?? [];
  return values.map((value) => value.trim()).filter(Boolean);
}

function resolvePathList(values: string[], workflowPath: string, env: NodeJS.ProcessEnv): string[] {
  return values.map((value) => resolveWorkspaceRoot(value, workflowPath, env));
}

function booleanFromEnv(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function resolveEnvReference(
  value: string,
  fallback: string | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined | null {
  const match = value.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!match) return value;
  const envValue = env[match[1]];
  if (envValue === "") return null;
  return envValue ?? fallback;
}

function resolveWorkspaceRoot(value: string, workflowPath: string, env: NodeJS.ProcessEnv): string {
  let pathValue = value;
  const envMatch = pathValue.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (envMatch) {
    pathValue = env[envMatch[1]] || resolve(tmpdir(), "symphony_workspaces");
  }
  if (pathValue === "~") pathValue = homedir();
  if (pathValue.startsWith("~/") || pathValue.startsWith("~\\")) {
    pathValue = resolve(homedir(), pathValue.slice(2));
  }
  if (!isAbsolute(pathValue)) {
    pathValue = resolve(dirname(workflowPath), pathValue);
  }
  return resolve(pathValue);
}

function normalizeStateLimits(value: Record<string, unknown> | undefined): Record<string, number> {
  if (!value) return {};
  const limits: Record<string, number> = {};
  for (const [stateName, limit] of Object.entries(value)) {
    if (
      stateName.trim() === "" ||
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit <= 0
    ) {
      continue;
    }
    limits[normalizeIssueState(stateName)] = limit;
  }
  return limits;
}

function zodMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ");
}
