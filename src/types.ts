export type WorkerHost = string | null;

export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: BlockerRef[];
  createdAt: Date | null;
  updatedAt: Date | null;
  assigneeId?: string | null;
  assignedToWorker?: boolean;
}

export interface WorkflowDefinition {
  config: Record<string, unknown>;
  prompt: string;
  promptTemplate: string;
}

export interface TrackerConfig {
  kind: "linear" | "memory" | string | null;
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  assignee: string | null;
  activeStates: string[];
  terminalStates: string[];
}

export interface LinearSubagentDef {
  id: string;
  purpose: string;
}

export interface LinearPhaseDef {
  subagents: LinearSubagentDef[];
  deliverables: string[];
}

export interface LinearOrchestrationSettings {
  enabled: boolean;
  phases: Record<string, LinearPhaseDef>;
}

export type TaskKind = "linear" | "adhoc";

export interface Settings {
  tracker: TrackerConfig;
  polling: { intervalMs: number };
  workspace: { root: string };
  worker: { sshHosts: string[]; maxConcurrentAgentsPerHost: number | null };
  agent: {
    maxConcurrentAgents: number;
    maxTurns: number;
    maxRetryBackoffMs: number;
    maxConcurrentAgentsByState: Record<string, number>;
    linearOrchestration: LinearOrchestrationSettings;
  };
  codex: {
    command: string;
    approvalPolicy: string | Record<string, unknown>;
    threadSandbox: string;
    turnSandboxPolicy: Record<string, unknown> | null;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
  };
  hooks: {
    afterCreate: string | null;
    beforeRun: string | null;
    afterRun: string | null;
    beforeRemove: string | null;
    timeoutMs: number;
  };
  observability: {
    dashboardEnabled: boolean;
    refreshMs: number;
    renderIntervalMs: number;
  };
  server: { port: number | null; host: string };
  slack: {
    enabled: boolean;
    botToken: string | null;
    signingSecret: string | null;
    allowedChannelIds: string[];
    allowedUserIds: string[];
    publicBaseUrl: string | null;
    commandName: string;
    artifactRoots: string[];
    requireApprovalFor: string[];
  };
  github: {
    enabled: boolean;
    allowedRepoRoots: string[];
    prTimeoutMs: number;
  };
}

export interface RuntimeEvent {
  event: string;
  timestamp: string;
  sessionId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  codexAppServerPid?: string | null;
  workerHost?: string | null;
  payload?: unknown;
  raw?: string;
  details?: unknown;
  reason?: unknown;
}

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
}

export interface RetryEntry {
  issueId: string;
  identifier: string;
  attempt: number;
  dueAtMs: number;
  timer: NodeJS.Timeout;
  error: string | null;
  workerHost: WorkerHost;
  workspacePath: string | null;
}

export interface RunningEntry {
  issue: Issue;
  identifier: string;
  abortController: AbortController;
  startedAt: Date;
  retryAttempt: number | null;
  sessionId: string | null;
  threadId: string | null;
  turnId: string | null;
  codexAppServerPid: string | null;
  lastCodexEvent: string | null;
  lastCodexTimestamp: Date | null;
  lastCodexMessage: string | null;
  codexInputTokens: number;
  codexOutputTokens: number;
  codexTotalTokens: number;
  lastReportedInputTokens: number;
  lastReportedOutputTokens: number;
  lastReportedTotalTokens: number;
  lastAssistantMessage: string | null;
  turnCount: number;
  workerHost: WorkerHost;
  workspacePath: string | null;
}
