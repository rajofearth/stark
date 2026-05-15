import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { watch, FSWatcher } from "chokidar";
import { parse } from "yaml";
import type { WorkflowDefinition } from "../types.js";
import type { Logger } from "../logging/logger.js";

export type WorkflowLoadError =
  | { code: "missing_workflow_file"; path: string; reason: unknown }
  | { code: "workflow_parse_error"; reason: unknown }
  | { code: "workflow_front_matter_not_a_map" };

export class WorkflowError extends Error {
  constructor(
    public readonly workflowError: WorkflowLoadError,
    message = formatWorkflowError(workflowError),
  ) {
    super(message);
  }
}

let workflowFilePath = resolve(process.cwd(), "WORKFLOW.md");

export function getWorkflowFilePath(): string {
  return workflowFilePath;
}

export function setWorkflowFilePath(path: string): void {
  workflowFilePath = resolve(path);
}

export function clearWorkflowFilePath(): void {
  workflowFilePath = resolve(process.cwd(), "WORKFLOW.md");
}

export async function loadWorkflow(path = workflowFilePath): Promise<WorkflowDefinition> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (reason) {
    throw new WorkflowError({ code: "missing_workflow_file", path, reason });
  }
  return parseWorkflow(content);
}

export function defaultWorkflow(): WorkflowDefinition {
  return parseWorkflow(`---
tracker:
  kind: memory
polling:
  interval_ms: 5000
workspace:
  root: ./.STARK-workspaces
agent:
  max_concurrent_agents: 1
  max_turns: 12
codex:
  approval_policy: never
  thread_sandbox: workspace-write
server:
  port: 4000
---
You are S.T.A.R.K, a Slack-controlled autonomous coding agent.

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Operating rules:

1. Work inside the provided workspace only.
2. Decide the lightest useful response: answer directly for informational asks, inspect files for context, and run commands only when they help complete or validate the request.
3. Treat Slack-created work as ad-hoc unless the user explicitly mentions a Linear issue. Do not query or mutate Linear as part of casual Slack chat.
4. If the task is ambiguous, explain the specific missing decision so S.T.A.R.K can ask the Slack thread.
5. Prefer small, reviewable changes and report validation results clearly.
6. Your final response is posted directly to the Slack thread. Write it as the natural user-facing reply—answer questions directly or report results clearly, without job IDs or placeholder acknowledgments.
7. Do not expose secrets, tokens, or private environment values in responses.
8. For risky actions such as publishing, deleting, creating repositories, or filing PRs, rely on S.T.A.R.K approval gates.
`);
}

export function parseWorkflow(content: string): WorkflowDefinition {
  const { frontMatterLines, promptLines } = splitFrontMatter(content);
  const yamlText = frontMatterLines.join("\n").trim();
  let config: unknown = {};
  if (yamlText !== "") {
    try {
      config = parse(yamlText);
    } catch (reason) {
      throw new WorkflowError({ code: "workflow_parse_error", reason });
    }
    if (!isPlainObject(config)) {
      throw new WorkflowError({ code: "workflow_front_matter_not_a_map" });
    }
  }

  const prompt = promptLines.join("\n").trim();
  return {
    config: config as Record<string, unknown>,
    prompt,
    promptTemplate: prompt,
  };
}

export class WorkflowStore {
  private workflow: WorkflowDefinition | null = null;
  private stamp: string | null = null;
  private watcher: FSWatcher | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly path: string,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    await this.forceReload();
    this.watcher = watch(this.path, { ignoreInitial: true, awaitWriteFinish: true });
    this.watcher.on("all", () => this.scheduleReload());
  }

  async stop(): Promise<void> {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    await this.watcher?.close();
    this.watcher = null;
  }

  async current(): Promise<WorkflowDefinition> {
    await this.reloadIfStampChanged();
    if (!this.workflow) {
      await this.forceReload();
    }
    return this.workflow!;
  }

  async forceReload(): Promise<void> {
    const workflow = existsSync(this.path) ? await loadWorkflow(this.path) : defaultWorkflow();
    this.workflow = workflow;
    this.stamp = existsSync(this.path) ? currentStamp(this.path) : "default";
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadIfStampChanged().catch((reason) => {
        this.logger.error("Failed to reload workflow; keeping last known good configuration", {
          path: this.path,
          reason: inspectReason(reason),
        });
      });
    }, 50);
  }

  private async reloadIfStampChanged(): Promise<void> {
    const stamp = existsSync(this.path) ? currentStamp(this.path) : "default";
    if (stamp === this.stamp) return;
    try {
      await this.forceReload();
    } catch (reason) {
      this.logger.error("Failed to reload workflow; keeping last known good configuration", {
        path: this.path,
        reason: inspectReason(reason),
      });
      if (!this.workflow) throw reason;
    }
  }
}

function splitFrontMatter(content: string): { frontMatterLines: string[]; promptLines: string[] } {
  const lines = content.split(/\r\n|\n|\r/);
  if (lines[0] !== "---") {
    return { frontMatterLines: [], promptLines: lines };
  }
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) {
    return { frontMatterLines: lines.slice(1), promptLines: [] };
  }
  return { frontMatterLines: lines.slice(1, end), promptLines: lines.slice(end + 1) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function currentStamp(path: string): string {
  const stat = statSync(path);
  return `${stat.mtimeMs}:${stat.size}`;
}

function formatWorkflowError(error: WorkflowLoadError): string {
  switch (error.code) {
    case "missing_workflow_file":
      return `Missing WORKFLOW.md at ${error.path}: ${String(error.reason)}`;
    case "workflow_front_matter_not_a_map":
      return "Failed to parse WORKFLOW.md: workflow front matter must decode to a map";
    case "workflow_parse_error":
      return `Failed to parse WORKFLOW.md: ${String(error.reason)}`;
  }
}

function inspectReason(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
