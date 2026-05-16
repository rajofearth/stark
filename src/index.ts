import { parseSettings, type ConfigError } from "./config/schema.js";
import { CodexAppServer } from "./codex/appServer.js";
import { DynamicToolExecutor } from "./codex/dynamicTool.js";
import { AgentRunner } from "./agentRunner.js";
import { HttpServer } from "./http/server.js";
import { Logger } from "./logging/logger.js";
import { Orchestrator } from "./orchestrator.js";
import { createTracker, type TrackerAdapter } from "./tracker/index.js";
import type { Settings } from "./types.js";
import { WorkflowStore, loadWorkflow } from "./workflow/workflow.js";
import { WorkspaceManager } from "./workspace/workspace.js";

export interface StarkOptions {
  workflowPath: string;
  logFile?: string | null;
  portOverride?: number | null;
  dashboardEnabledOverride?: boolean | null;
  logger?: Logger;
}

export class StarkRuntime {
  private settings: Settings | null = null;
  private workflowStore: WorkflowStore;
  private tracker: TrackerAdapter;
  private workspaceManager: WorkspaceManager;
  private orchestrator: Orchestrator;
  private codex: CodexAppServer;
  private httpServer: HttpServer | null = null;
  private dashboardUrlValue: string | null = null;
  private logger: Logger;

  constructor(private readonly options: StarkOptions) {
    this.logger = options.logger ?? new Logger({ logFile: options.logFile, stderr: true });
    this.workflowStore = new WorkflowStore(options.workflowPath, this.logger);
    const settingsProvider = () => this.getSettings();
    this.workspaceManager = new WorkspaceManager(settingsProvider, this.logger);
    this.tracker = createTracker(settingsProvider);
    const tools = new DynamicToolExecutor(this.tracker);
    this.codex = new CodexAppServer(settingsProvider, this.logger, tools);
    const runner = new AgentRunner(
      settingsProvider,
      this.workflowStore,
      this.workspaceManager,
      this.tracker,
      this.codex,
      this.logger,
    );
    this.orchestrator = new Orchestrator(
      settingsProvider,
      this.tracker,
      this.workspaceManager,
      runner,
      this.logger,
    );
  }

  async start(): Promise<void> {
    await this.workflowStore.start();
    await this.reloadSettings();
    await this.orchestrator.start();
    const settings = this.getSettings();
    const port = settings.server.port;
    if (settings.observability.dashboardEnabled && typeof port === "number") {
      this.httpServer = new HttpServer(
        this.orchestrator,
        this.codex,
        () => this.getSettings(),
        this.logger,
        port,
        settings.server.host,
        this.options.workflowPath,
      );
      const boundPort = await this.httpServer.start();
      this.dashboardUrlValue = `http://${settings.server.host}:${boundPort}/`;
      this.logger.info("HTTP observability server started", {
        host: settings.server.host,
        port: boundPort,
        url: this.dashboardUrlValue,
      });
    }
    setInterval(() => void this.reloadSettings().catch(() => undefined), 1_000).unref();
  }

  async stop(): Promise<void> {
    this.orchestrator.stop();
    await this.httpServer?.stop();
    this.dashboardUrlValue = null;
    await this.workflowStore.stop();
  }

  snapshot(): Record<string, unknown> {
    return this.orchestrator.snapshot();
  }

  dashboardUrl(): string | null {
    return this.dashboardUrlValue;
  }

  private getSettings(): Settings {
    if (!this.settings) throw new Error("settings_not_loaded");
    return this.settings;
  }

  private async reloadSettings(): Promise<void> {
    const workflow = await this.workflowStore.current();
    const settings = parseSettings(workflow.config, this.options.workflowPath);
    if (this.options.portOverride !== undefined && this.options.portOverride !== null) {
      settings.server.port = this.options.portOverride;
    }
    if (
      this.options.dashboardEnabledOverride !== undefined &&
      this.options.dashboardEnabledOverride !== null
    ) {
      settings.observability.dashboardEnabled = this.options.dashboardEnabledOverride;
    }
    this.settings = settings;
  }
}

export async function validateWorkflow(workflowPath: string): Promise<Settings> {
  const workflow = await loadWorkflow(workflowPath);
  return parseSettings(workflow.config, workflowPath);
}

export type { Settings, TrackerAdapter };
