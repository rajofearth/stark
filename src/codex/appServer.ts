import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { Issue, RuntimeEvent, Settings, WorkerHost } from "../types.js";
import type { Logger } from "../logging/logger.js";
import { ensureInsideRoot } from "../pathSafety.js";
import { hostShellCommand, shellEscape, sshShellCommand } from "../shell.js";
import { runtimeTurnSandboxPolicy } from "../config/schema.js";
import { linearGraphqlToolSpec, type DynamicToolExecutor } from "./dynamicTool.js";

const initializeId = 1;
const threadStartId = 2;
const turnStartId = 3;

export interface CodexSession {
  process: ChildProcessWithoutNullStreams;
  threadId: string;
  workspace: string;
  workerHost: WorkerHost;
  approvalPolicy: string | Record<string, unknown>;
  threadSandbox: string;
  turnSandboxPolicy: Record<string, unknown>;
}

export class CodexAppServer {
  constructor(
    private settingsProvider: () => Settings,
    private readonly logger: Logger,
    private readonly toolExecutor: DynamicToolExecutor,
  ) {}

  async startSession(workspace: string, workerHost: WorkerHost = null): Promise<CodexSession> {
    const safeWorkspace = workerHost
      ? workspace
      : await ensureInsideRoot(workspace, this.settingsProvider().workspace.root);
    const process = this.startProcess(safeWorkspace, workerHost);
    const approvalPolicy = this.settingsProvider().codex.approvalPolicy;
    const threadSandbox = this.settingsProvider().codex.threadSandbox;
    const turnSandboxPolicy = runtimeTurnSandboxPolicy(this.settingsProvider(), safeWorkspace);
    try {
      await this.sendRequest(process, {
        method: "initialize",
        id: initializeId,
        params: {
          capabilities: { experimentalApi: true },
          clientInfo: {
            name: "stark-orchestrator",
            title: "S.T.A.R.K Orchestrator",
            version: "0.1.0",
          },
        },
      });
      this.send(process, { method: "initialized", params: {} });
      const thread = await this.sendRequest(process, {
        method: "thread/start",
        id: threadStartId,
        params: {
          approvalPolicy,
          sandbox: threadSandbox,
          cwd: safeWorkspace,
          dynamicTools: [linearGraphqlToolSpec],
        },
      });
      const threadId = getPath<string>(thread, ["thread", "id"]);
      if (!threadId) throw new Error(`invalid_thread_payload:${JSON.stringify(thread)}`);
      return {
        process,
        threadId,
        workspace: safeWorkspace,
        workerHost,
        approvalPolicy,
        threadSandbox,
        turnSandboxPolicy,
      };
    } catch (reason) {
      process.kill();
      throw reason;
    }
  }

  async runTurn(
    session: CodexSession,
    prompt: string,
    issue: Issue,
    onMessage: (event: RuntimeEvent) => void,
  ): Promise<{ sessionId: string; threadId: string; turnId: string }> {
    const response = await this.sendRequest(session.process, {
      method: "turn/start",
      id: turnStartId,
      params: {
        threadId: session.threadId,
        input: [{ type: "text", text: prompt }],
        cwd: session.workspace,
        title: `${issue.identifier}: ${issue.title}`,
        approvalPolicy: session.approvalPolicy,
        sandboxPolicy: session.turnSandboxPolicy,
      },
    });
    const turnId = getPath<string>(response, ["turn", "id"]);
    if (!turnId) throw new Error(`invalid_turn_payload:${JSON.stringify(response)}`);
    const sessionId = `${session.threadId}-${turnId}`;
    onMessage({
      event: "session_started",
      timestamp: new Date().toISOString(),
      sessionId,
      threadId: session.threadId,
      turnId,
      codexAppServerPid: String(session.process.pid ?? ""),
      workerHost: session.workerHost,
    });
    await this.awaitTurnCompletion(session.process, onMessage, sessionId);
    return { sessionId, threadId: session.threadId, turnId };
  }

  stopSession(session: CodexSession): void {
    session.process.kill();
  }

  private startProcess(workspace: string, workerHost: WorkerHost): ChildProcessWithoutNullStreams {
    if (workerHost) {
      const remoteCommand = `cd ${shellEscape(workspace)} && exec ${this.settingsProvider().codex.command}`;
      return spawn("ssh", [workerHost, sshShellCommand(remoteCommand)], { windowsHide: true });
    }
    const shell = hostShellCommand(this.settingsProvider().codex.command);
    return spawn(shell.command, shell.args, { cwd: workspace, windowsHide: true });
  }

  private async awaitTurnCompletion(
    process: ChildProcessWithoutNullStreams,
    onMessage: (event: RuntimeEvent) => void,
    sessionId: string,
  ): Promise<void> {
    const timeoutMs = this.settingsProvider().codex.turnTimeoutMs;
    const lineReader = createInterface({ input: process.stdout });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("turn_timeout")), timeoutMs);
      process.once("exit", (status) => {
        clearTimeout(timer);
        reject(new Error(`port_exit:${status}`));
      });
      lineReader.on("line", async (line) => {
        const payload = parseLine(line);
        if (!payload) return;
        const method = typeof payload.method === "string" ? payload.method : null;
        if (method === "turn/completed") {
          clearTimeout(timer);
          onMessage(runtimeEvent("turn_completed", payload, sessionId));
          resolve();
          return;
        }
        if (method === "turn/failed" || method === "turn/cancelled") {
          clearTimeout(timer);
          onMessage(
            runtimeEvent(
              method === "turn/failed" ? "turn_failed" : "turn_cancelled",
              payload,
              sessionId,
            ),
          );
          reject(new Error(method));
          return;
        }
        try {
          const handled = await this.handleToolOrApproval(process, payload, onMessage, sessionId);
          if (!handled) onMessage(runtimeEvent("notification", payload, sessionId));
        } catch (reason) {
          clearTimeout(timer);
          reject(reason);
        }
      });
    });
  }

  private async handleToolOrApproval(
    process: ChildProcessWithoutNullStreams,
    payload: Record<string, unknown>,
    onMessage: (event: RuntimeEvent) => void,
    sessionId: string,
  ): Promise<boolean> {
    const method = payload.method;
    const id = payload.id;
    if (method === "item/tool/call" && typeof id !== "undefined") {
      const params = payload.params as Record<string, unknown> | undefined;
      const toolName =
        getPath<string>(params, ["toolCall", "name"]) ?? getPath<string>(params, ["name"]);
      const args = getPath<unknown>(params, ["toolCall", "arguments"]) ?? params?.arguments;
      const result = await this.toolExecutor.execute(toolName, args);
      this.send(process, { id, result });
      onMessage(
        runtimeEvent(
          result.success ? "tool_call_completed" : "tool_call_failed",
          payload,
          sessionId,
        ),
      );
      return true;
    }
    if (isApprovalMethod(method) && typeof id !== "undefined") {
      if (this.settingsProvider().codex.approvalPolicy === "never") {
        this.send(process, { id, result: { decision: "acceptForSession" } });
        onMessage(runtimeEvent("approval_auto_approved", payload, sessionId));
        return true;
      }
      onMessage(runtimeEvent("approval_required", payload, sessionId));
      throw new Error("approval_required");
    }
    if (method === "turn/inputRequired" || method === "inputRequired") {
      onMessage(runtimeEvent("turn_input_required", payload, sessionId));
      throw new Error("turn_input_required");
    }
    return false;
  }

  private sendRequest(
    process: ChildProcessWithoutNullStreams,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = payload.id;
    this.send(process, payload);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("response_timeout")),
        this.settingsProvider().codex.readTimeoutMs,
      );
      const lineReader = createInterface({ input: process.stdout });
      const onLine = (line: string) => {
        const response = parseLine(line);
        if (response && response.id === id) {
          clearTimeout(timeout);
          lineReader.off("line", onLine);
          const matched = response;
          if (matched.error) reject(new Error(`response_error:${JSON.stringify(matched.error)}`));
          else resolve((matched.result as Record<string, unknown>) ?? matched);
        }
      };
      lineReader.on("line", onLine);
    });
  }

  private send(process: ChildProcessWithoutNullStreams, payload: Record<string, unknown>): void {
    process.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runtimeEvent(
  event: string,
  payload: Record<string, unknown>,
  sessionId: string,
): RuntimeEvent {
  return {
    event,
    timestamp: new Date().toISOString(),
    sessionId,
    payload,
    raw: JSON.stringify(payload),
  };
}

function isApprovalMethod(method: unknown): boolean {
  return (
    method === "item/commandExecution/requestApproval" ||
    method === "execCommandApproval" ||
    method === "applyPatchApproval" ||
    method === "item/fileChange/requestApproval"
  );
}

function getPath<T>(value: unknown, path: string[]): T | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T;
}
