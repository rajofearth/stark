import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
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
    const workflow = await loadWorkflow(this.path);
    this.workflow = workflow;
    this.stamp = currentStamp(this.path);
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
    const stamp = currentStamp(this.path);
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
