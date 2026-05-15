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
  reader: ProcessLineReader;
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
    const reader = new ProcessLineReader(process);
    const approvalPolicy = this.settingsProvider().codex.approvalPolicy;
    const threadSandbox = this.settingsProvider().codex.threadSandbox;
    const turnSandboxPolicy = runtimeTurnSandboxPolicy(this.settingsProvider(), safeWorkspace);
    try {
      await this.sendRequest(process, reader, {
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
      const thread = await this.sendRequest(process, reader, {
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
        reader,
        threadId,
        workspace: safeWorkspace,
        workerHost,
        approvalPolicy,
        threadSandbox,
        turnSandboxPolicy,
      };
    } catch (reason) {
      reader.close();
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
    const response = await this.sendRequest(session.process, session.reader, {
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
    await this.awaitTurnCompletion(session, onMessage, sessionId);
    return { sessionId, threadId: session.threadId, turnId };
  }

  stopSession(session: CodexSession): void {
    session.reader.close();
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
    session: CodexSession,
    onMessage: (event: RuntimeEvent) => void,
    sessionId: string,
  ): Promise<void> {
    const deadline = Date.now() + this.settingsProvider().codex.turnTimeoutMs;
    while (true) {
      const line = await nextLineBefore(session.reader, deadline, "turn_timeout");
      if (line === null) throw new Error("port_exit");
      const payload = parseLine(line);
      if (!payload) continue;
      const method = typeof payload.method === "string" ? payload.method : null;
      if (method === "turn/completed") {
        onMessage(runtimeEvent("turn_completed", payload, sessionId));
        return;
      }
      if (method === "turn/failed" || method === "turn/cancelled") {
        onMessage(
          runtimeEvent(
            method === "turn/failed" ? "turn_failed" : "turn_cancelled",
            payload,
            sessionId,
          ),
        );
        throw new Error(method);
      }
      const handled = await this.handleToolOrApproval(
        session.process,
        payload,
        onMessage,
        sessionId,
      );
      if (!handled) onMessage(runtimeEvent("notification", payload, sessionId));
    }
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
        getPath<string>(params, ["toolCall", "name"]) ??
        getPath<string>(params, ["toolCall", "toolName"]) ??
        getPath<string>(params, ["call", "name"]) ??
        getPath<string>(params, ["call", "toolName"]) ??
        getPath<string>(params, ["name"]) ??
        getPath<string>(params, ["toolName"]);
      const args =
        getPath<unknown>(params, ["toolCall", "arguments"]) ??
        getPath<unknown>(params, ["toolCall", "input"]) ??
        getPath<unknown>(params, ["call", "arguments"]) ??
        getPath<unknown>(params, ["call", "input"]) ??
        params?.arguments ??
        params?.input;
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

  private async sendRequest(
    process: ChildProcessWithoutNullStreams,
    reader: ProcessLineReader,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const id = payload.id;
    this.send(process, payload);
    const deadline = Date.now() + this.settingsProvider().codex.readTimeoutMs;
    while (true) {
      const line = await nextLineBefore(reader, deadline, "response_timeout");
      if (line === null) throw new Error("port_exit");
      const response = parseLine(line);
      if (response && response.id === id) {
        if (response.error) throw new Error(`response_error:${JSON.stringify(response.error)}`);
        return (response.result as Record<string, unknown>) ?? response;
      }
    }
  }

  private send(process: ChildProcessWithoutNullStreams, payload: Record<string, unknown>): void {
    process.stdin.write(`${JSON.stringify(payload)}\n`);
  }
}

class ProcessLineReader {
  private readonly lineReader;
  private readonly bufferedLines: string[] = [];
  private readonly waiters: Array<(line: string | null) => void> = [];
  private closed = false;

  constructor(process: ChildProcessWithoutNullStreams) {
    this.lineReader = createInterface({ input: process.stdout });
    this.lineReader.on("line", (line) => this.push(line));
    this.lineReader.once("close", () => this.close());
    process.once("exit", () => this.close());
  }

  nextLine(): Promise<string | null> {
    if (this.bufferedLines.length > 0) return Promise.resolve(this.bufferedLines.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.lineReader.close();
    while (this.waiters.length > 0) {
      this.waiters.shift()!(null);
    }
  }

  private push(line: string): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(line);
    else this.bufferedLines.push(line);
  }
}

async function nextLineBefore(
  reader: ProcessLineReader,
  deadline: number,
  timeoutReason: string,
): Promise<string | null> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error(timeoutReason);
  return Promise.race([
    reader.nextLine(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutReason)), remainingMs);
    }),
  ]);
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
