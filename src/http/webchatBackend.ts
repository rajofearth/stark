import type { Express, Response } from "express";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { platform } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import type { CodexAppServer, CodexSession } from "../codex/appServer.js";
import type { Logger } from "../logging/logger.js";
import { ensureInsideRoot } from "../pathSafety.js";
import type { RuntimeEvent, Settings } from "../types.js";

interface WebchatConversation {
  id: string;
  threadId: string;
  title: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  source?: "active" | "codex";
  preview?: string;
}

interface WebchatMessage {
  id: string;
  convId: string;
  type: "user" | "assistant";
  text: string;
  ts: number;
}

interface ActiveConversation extends WebchatConversation {
  session: CodexSession;
  running: boolean;
}

export class WebchatBackend {
  private readonly conversations = new Map<string, ActiveConversation>();

  constructor(
    private readonly codex: CodexAppServer,
    private readonly settingsProvider: () => Settings,
    private readonly logger: Logger,
  ) {}

  registerRoutes(app: Express): void {
    app.get("/api/webchat/conversations", async (_request, response) => {
      await this.handleHttp(response, async () => {
        response.json({ conversations: await this.listConversations() });
      });
    });

    app.post("/api/webchat/conversations", async (request, response) => {
      await this.handleHttp(response, async () => {
        const title = stringOrDefault(request.body?.title, "New Conversation");
        const conv = await this.startConversation(title);
        response.status(201).json({ conversation: publicConversation(conv) });
      });
    });

    app.get("/api/webchat/conversations/:threadId/messages", async (request, response) => {
      await this.handleHttp(response, async () => {
        const threadId = request.params.threadId;
        const messages = await this.readConversationMessages(threadId);
        response.json({ messages });
      });
    });

    app.post("/api/webchat/conversations/:threadId/resume", async (request, response) => {
      await this.handleHttp(response, async () => {
        const threadId = request.params.threadId;
        const title = stringOrDefault(request.body?.title, "Resumed Conversation");
        const conv = await this.ensureConversation(threadId, title);
        response.json({ conversation: publicConversation(conv) });
      });
    });

    app.post("/api/webchat/send", async (request, response) => {
      await this.handleHttp(response, async () => {
        const threadId = typeof request.body?.threadId === "string" ? request.body.threadId : null;
        const text = stringOrDefault(request.body?.text, "").trim();
        const title = stringOrDefault(request.body?.title, text.slice(0, 80) || "Web Chat");
        if (!text) {
          response
            .status(400)
            .json({ error: { code: "empty_message", message: "Message is required" } });
          return;
        }
        const conv = threadId
          ? await this.ensureConversation(threadId, title)
          : await this.startConversation(title);
        const assistantText = await this.runTurn(conv, text, (event) => {
          this.logger.debug("webchat_http_event", { event: event.event, threadId: conv.threadId });
        });
        response.json({ conversation: publicConversation(conv), content: assistantText });
      });
    });

    app.get("/api/webchat/files", async (request, response) => {
      await this.handleHttp(response, async () => {
        const rawPath = stringOrDefault(request.query.path, "");
        if (!rawPath) {
          response
            .status(400)
            .json({ error: { code: "missing_path", message: "File path is required" } });
          return;
        }
        const safePath = await this.resolveDownloadPath(rawPath);
        if (!safePath) {
          response
            .status(404)
            .json({ error: { code: "file_not_found", message: "File not found" } });
          return;
        }
        if (request.query.download === "1") {
          response.download(safePath, basename(safePath));
          return;
        }
        await openInFileBrowser(safePath);
        response.type("html").send(renderOpenedFilePage(safePath));
      });
    });
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/webchat/stream") return false;
    if (head.length > 0) {
      socket.destroy();
      return true;
    }
    const key = request.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return true;
    }
    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        "",
      ].join("\r\n"),
    );
    const ws = new SimpleWebSocket(socket);
    ws.onMessage((message) => void this.handleWsMessage(ws, message));
    void this.listConversations()
      .then((conversations) => ws.send({ event: "connected", conversations }))
      .catch((reason) => {
        this.logger.debug("webchat_history_list_failed", {
          error: reason instanceof Error ? reason.message : String(reason),
        });
        ws.send({
          event: "connected",
          conversations: Array.from(this.conversations.values()).map(publicConversation),
        });
      });
    return true;
  }

  stop(): void {
    for (const conv of this.conversations.values()) {
      this.codex.stopSession(conv.session);
    }
    this.conversations.clear();
  }

  private async handleWsMessage(ws: SimpleWebSocket, raw: string): Promise<void> {
    let packet: Record<string, unknown>;
    try {
      packet = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      ws.send({ event: "error", code: "invalid_json", message: "Invalid JSON" });
      return;
    }

    const type = typeof packet.type === "string" ? packet.type : "";
    try {
      if (type === "conversation.create" || type === "session.create") {
        const title = stringOrDefault(packet.title, "New Conversation");
        const conv = await this.startConversation(title);
        ws.send({ event: "session.created", conversation: publicConversation(conv) });
        return;
      }

      if (type === "conversation.resume" || type === "session.resume") {
        const threadId = stringOrDefault(packet.threadId, "");
        if (!threadId) throw new Error("missing_thread_id");
        const title = stringOrDefault(packet.title, "Resumed Conversation");
        const conv = await this.ensureConversation(threadId, title);
        ws.send({ event: "session.resumed", conversation: publicConversation(conv) });
        return;
      }

      if (type === "user_message" || type === "message.send") {
        const text = stringOrDefault(packet.text, "").trim();
        if (!text) throw new Error("empty_message");
        const threadId = stringOrDefault(packet.threadId, "");
        const title = stringOrDefault(packet.title, text.slice(0, 80) || "Web Chat");
        const conv = threadId
          ? await this.ensureConversation(threadId, title)
          : await this.startConversation(title);
        ws.send({ event: "message.started", conversation: publicConversation(conv) });
        let streamedText = "";
        const fullText = await this.runTurn(conv, text, (event) => {
          const webEvent = runtimeEventForWebchat(event);
          if (webEvent) ws.send(webEvent);
          const plan = extractPlan(event.payload);
          if (plan) ws.send({ event: "plan.update", plan, threadId: conv.threadId });
          const extracted = extractAssistantText(event.payload, text);
          const delta = nextAssistantDelta(streamedText, extracted);
          if (!delta) return;
          streamedText += delta;
          ws.send({ event: "message.delta", delta, content: streamedText });
        });
        ws.send({
          event: "message.completed",
          content: fullText,
          conversation: publicConversation(conv),
        });
        return;
      }

      ws.send({ event: "error", code: "unknown_type", message: `Unknown message type: ${type}` });
    } catch (reason) {
      ws.send({
        event: "message.error",
        code: reason instanceof Error ? reason.message : "webchat_error",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  private async startConversation(title: string): Promise<ActiveConversation> {
    const workspace = await this.webchatWorkspace();
    const session = await this.codex.startSession(workspace);
    const now = new Date().toISOString();
    const conv: ActiveConversation = {
      id: session.threadId,
      threadId: session.threadId,
      title,
      workspace,
      createdAt: now,
      updatedAt: now,
      active: true,
      session,
      running: false,
    };
    this.conversations.set(session.threadId, conv);
    return conv;
  }

  private async ensureConversation(threadId: string, title: string): Promise<ActiveConversation> {
    const active = this.conversations.get(threadId);
    if (active) return active;
    const workspace = await this.webchatWorkspace();
    const session = await this.codex.resumeSession(workspace, threadId);
    const now = new Date().toISOString();
    const conv: ActiveConversation = {
      id: session.threadId,
      threadId: session.threadId,
      title,
      workspace,
      createdAt: now,
      updatedAt: now,
      active: true,
      session,
      running: false,
    };
    this.conversations.set(session.threadId, conv);
    return conv;
  }

  private async runTurn(
    conv: ActiveConversation,
    text: string,
    onEvent: (event: RuntimeEvent) => void,
  ): Promise<string> {
    if (conv.running) throw new Error("conversation_busy");
    conv.running = true;
    conv.updatedAt = new Date().toISOString();
    let assistantText = "";
    try {
      await this.codex.runDirectTurn(conv.session, webchatTurnPrompt(text), conv.title, (event) => {
        const extracted = extractAssistantText(event.payload, text);
        const delta = nextAssistantDelta(assistantText, extracted);
        if (delta) assistantText += delta;
        onEvent(event);
      });
      return assistantText.trim() ? assistantText : finalTurnFallback();
    } finally {
      conv.running = false;
      conv.updatedAt = new Date().toISOString();
    }
  }

  private async webchatWorkspace(): Promise<string> {
    const workspace = join(this.settingsProvider().workspace.root, "webchat");
    await mkdir(workspace, { recursive: true });
    return workspace;
  }

  private async resolveDownloadPath(rawPath: string): Promise<string | null> {
    const roots = this.downloadRoots();
    const candidates = new Set<string>();
    if (isAbsolute(rawPath)) candidates.add(rawPath);
    else {
      for (const root of roots) candidates.add(join(root, rawPath));
    }
    for (const candidate of candidates) {
      const safePath = await existingFileInsideAnyRoot(candidate, roots);
      if (safePath) return safePath;
    }

    // If the stored assistant text contains a stale absolute path but the artifact still exists in
    // the webchat workspace, fall back to a bounded basename lookup under known artifact roots.
    const name = basename(rawPath);
    if (!name || name === "." || name === "..") return null;
    for (const root of roots) {
      const found = await findFileByBasename(root, name, 4);
      if (found) return found;
    }
    return null;
  }

  private downloadRoots(): string[] {
    const root = this.settingsProvider().workspace.root;
    return Array.from(
      new Set([
        root,
        join(root, "webchat"),
        ...Array.from(this.conversations.values()).map((c) => c.workspace),
      ]),
    );
  }

  private async listConversations(): Promise<WebchatConversation[]> {
    const byThread = new Map<string, WebchatConversation>();
    for (const conv of await this.listCodexConversations()) byThread.set(conv.threadId, conv);
    for (const conv of Array.from(this.conversations.values()).map(publicConversation)) {
      byThread.set(conv.threadId, conv);
    }
    return Array.from(byThread.values()).sort(
      (a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt),
    );
  }

  private async listCodexConversations(): Promise<WebchatConversation[]> {
    const workspace = await this.webchatWorkspace();
    try {
      const result = await this.codex.listThreads(workspace, {
        limit: 100,
        cwd: workspace,
        sourceKinds: ["appServer"],
        sortKey: "updated_at",
      });
      return result.data
        .map((thread) => conversationFromCodexThread(thread, workspace))
        .filter((conversation) => conversation.threadId);
    } catch (reason) {
      this.logger.debug("webchat_codex_history_unavailable", {
        error: reason instanceof Error ? reason.message : String(reason),
      });
      return [];
    }
  }

  private async readConversationMessages(threadId: string): Promise<WebchatMessage[]> {
    const workspace = await this.webchatWorkspace();
    const result = await this.codex.readThread(workspace, threadId, true);
    const thread = path(result, ["thread"]) ?? result;
    return messagesFromCodexThread(thread, threadId);
  }

  private async handleHttp(response: Response, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      response.status(message === "missing_thread_id" ? 400 : 500).json({
        error: { code: message || "webchat_error", message },
      });
    }
  }
}

class SimpleWebSocket {
  private readonly messageHandlers: Array<(message: string) => void> = [];
  private buffer = Buffer.alloc(0);

  constructor(private readonly socket: Duplex) {
    socket.on("data", (chunk) => this.read(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    socket.on("error", () => undefined);
  }

  onMessage(handler: (message: string) => void): void {
    this.messageHandlers.push(handler);
  }

  send(payload: unknown): void {
    if (this.socket.destroyed) return;
    const data = Buffer.from(JSON.stringify(payload));
    let header: Buffer;
    if (data.length < 126) {
      header = Buffer.from([0x81, data.length]);
    } else if (data.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    this.socket.write(Buffer.concat([header, data]));
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const bigLength = this.buffer.readBigUInt64BE(offset);
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.socket.destroy();
          return;
        }
        length = Number(bigLength);
        offset += 8;
      }
      const maskOffset = offset;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;
      const frame = this.buffer;
      const payload = frame.subarray(offset, offset + length);
      const mask = frame.subarray(maskOffset, maskOffset + 4);
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 0x8) {
        this.socket.end();
        return;
      }
      if (opcode !== 0x1) continue;
      if (!masked) {
        this.socket.destroy();
        return;
      }
      const unmasked = Buffer.alloc(payload.length);
      for (let index = 0; index < payload.length; index++) {
        unmasked[index] = payload[index] ^ mask[index % 4];
      }
      const message = unmasked.toString("utf8");
      for (const handler of this.messageHandlers) handler(message);
    }
  }
}

async function openInFileBrowser(filePath: string): Promise<void> {
  const os = platform();
  const command = os === "darwin" ? "open" : os === "win32" ? "explorer.exe" : "xdg-open";
  const args =
    os === "darwin"
      ? ["-R", filePath]
      : os === "win32"
        ? [`/select,${filePath}`]
        : [dirname(filePath)];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.once("error", () => undefined);
  child.unref();
}

function renderOpenedFilePage(filePath: string): string {
  const escapedPath = escapeHtml(filePath);
  const escapedName = escapeHtml(basename(filePath));
  return `<!doctype html><html><head><meta charset="utf-8"><title>Opened ${escapedName}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;padding:24px;"><h2>Opened in file browser</h2><p><strong>${escapedName}</strong></p><p style="color:#666;word-break:break-all;">${escapedPath}</p><p>If nothing opened, make sure S.T.A.R.K is running on your local machine.</p></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function existingFileInsideAnyRoot(path: string, roots: string[]): Promise<string | null> {
  for (const root of roots) {
    const safePath = await ensureInsideRoot(path, root).catch(() => null);
    if (!safePath) continue;
    const fileStat = await stat(safePath).catch(() => null);
    if (fileStat?.isFile()) return safePath;
  }
  return null;
}

async function findFileByBasename(
  root: string,
  name: string,
  maxDepth: number,
): Promise<string | null> {
  if (maxDepth < 0) return null;
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) return null;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const child = join(root, entry.name);
    if (entry.isFile() && entry.name === name) return child;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
    const found = await findFileByBasename(join(root, entry.name), name, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

function webchatTurnPrompt(userText: string): string {
  return [
    userText,
    "",
    "---",
    "Stark webchat response rules:",
    "- Use tools as needed, but do not stop after a tool call.",
    "- Always finish the turn with a concise user-facing response summarizing what happened, what changed or was found, and any next step.",
    "- If you created or changed files, include the exact file path(s) in the final response.",
  ].join("\n");
}

function finalTurnFallback(): string {
  return "I finished the run, but no final written summary was produced. Check the tool activity above for what happened, then send a follow-up if you want me to continue or clarify.";
}

function publicConversation(conv: ActiveConversation): WebchatConversation {
  return {
    id: conv.id,
    threadId: conv.threadId,
    title: conv.title,
    workspace: conv.workspace,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    active: conv.active,
    source: "active",
  };
}

function conversationFromCodexThread(
  thread: Record<string, unknown>,
  fallbackWorkspace: string,
): WebchatConversation {
  const id = firstString(thread.id, path(thread, ["thread", "id"]));
  const preview = firstString(thread.preview, thread.summary, thread.description);
  const title = firstString(thread.name, thread.title, preview) || "Codex Conversation";
  const createdAt = dateFromCodexTime(thread.createdAt) ?? new Date().toISOString();
  const updatedAt = dateFromCodexTime(thread.updatedAt) ?? createdAt;
  return {
    id,
    threadId: id,
    title: truncateText(title, 80),
    workspace: firstString(thread.cwd, path(thread, ["session", "cwd"])) || fallbackWorkspace,
    createdAt,
    updatedAt,
    active: false,
    source: "codex",
    preview,
  };
}

function messagesFromCodexThread(value: unknown, threadId: string): WebchatMessage[] {
  const turns = path(value, ["turns"]);
  const entries = Array.isArray(turns) ? turns : [];
  const messages: WebchatMessage[] = [];
  entries.forEach((turn, turnIndex) => {
    if (!turn || typeof turn !== "object") return;
    const turnRecord = turn as Record<string, unknown>;
    const ts = timestampMs(
      dateFromCodexTime(turnRecord.createdAt) ?? dateFromCodexTime(turnRecord.updatedAt),
    );
    const items = Array.isArray(turnRecord.items) ? turnRecord.items : [];
    items.forEach((item, itemIndex) => {
      const message = messageFromCodexItem(item, threadId, turnIndex, itemIndex, ts || Date.now());
      if (message) messages.push(message);
    });
  });
  return dedupeMessages(messages);
}

function messageFromCodexItem(
  value: unknown,
  threadId: string,
  turnIndex: number,
  itemIndex: number,
  ts: number,
): WebchatMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const type = firstString(item.type, path(item, ["item", "type"]));
  const role = firstString(
    item.role,
    path(item, ["message", "role"]),
    path(item, ["author", "role"]),
  );
  const isUser = type === "userMessage" || role === "user";
  const isAssistant =
    type === "agentMessage" ||
    type === "assistantMessage" ||
    role === "assistant" ||
    role === "agent";
  if (!isUser && !isAssistant) return null;
  const rawText =
    firstString(item.text, path(item, ["message", "content"])) || contentToText(item.content);
  const text = isUser ? stripWebchatPrompt(rawText) : rawText;
  if (!text.trim()) return null;
  const stableId = firstString(item.id) || `${turnIndex}-${itemIndex}`;
  return {
    id: `codex-${threadId}-${stableId}-${isUser ? "user" : "assistant"}`,
    convId: threadId,
    type: isUser ? "user" : "assistant",
    text,
    ts: ts + itemIndex,
  };
}

function dedupeMessages(messages: WebchatMessage[]): WebchatMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    const key = `${message.type}:${normalizeMessageText(message.text)}:${message.ts}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stripWebchatPrompt(text: string): string {
  const marker = "\n\n---\nStark webchat response rules:";
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(0, index).trim() : text;
}

function dateFromCodexTime(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString();
  }
  if (typeof value === "string" && value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value)) return dateFromCodexTime(numeric);
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return null;
}

function timestampMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value))
    return value < 10_000_000_000 ? value * 1000 : value;
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return timestampMs(numeric);
  }
  return 0;
}

function compactRuntimeEvent(event: RuntimeEvent): Record<string, unknown> {
  return {
    event: event.event,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    threadId: event.threadId,
    turnId: event.turnId,
    payload: event.payload,
  };
}

function runtimeEventForWebchat(event: RuntimeEvent): Record<string, unknown> | null {
  const payload = event.payload;
  const method = firstString(path(payload, ["method"]), path(payload, ["type"]), event.event);
  if (!method) return null;
  if (event.event === "session_started" || event.event === "turn_completed") return null;
  if (event.event === "turn_failed" || event.event === "turn_cancelled") {
    return {
      event: "runtime.activity",
      kind: "error",
      title: humanizeEventName(event.event),
      detail: extractErrorText(payload),
    };
  }
  if (event.event === "approval_required" || event.event === "approval_auto_approved") {
    return {
      event: "runtime.activity",
      kind: event.event === "approval_required" ? "approval" : "approved",
      title: event.event === "approval_required" ? "Approval required" : "Approved automatically",
      key: runtimeEventKey(payload) || toolOrCommandName(payload) || method,
      detail: truncateText(toolOrCommandName(payload) || humanizeEventName(method), 160),
    };
  }
  if (isToolOutputDeltaEvent(payload)) return null;
  if (
    event.event === "tool_call_completed" ||
    event.event === "tool_call_failed" ||
    isToolOrCommandEvent(payload)
  ) {
    return {
      event: "runtime.tool",
      status:
        event.event === "tool_call_failed" || /failed|error/i.test(method) ? "failed" : "completed",
      title: truncateText(toolOrCommandName(payload) || humanizeEventName(method), 90),
      key: runtimeEventKey(payload) || toolOrCommandName(payload) || method,
      detail: summarizeRuntimePayload(payload),
    };
  }
  if (
    isAssistantMessageEvent(payload) ||
    isUserAuthoredEvent(payload) ||
    isUserInputEvent(payload)
  ) {
    return null;
  }
  if (
    isIgnorableRuntimeEvent(method) ||
    isNoisyRuntimeEvent(method, payload) ||
    isReasoningEvent(payload)
  ) {
    return null;
  }
  return null;
}

function extractAssistantText(value: unknown, userText = ""): string {
  if (!isAssistantMessageEvent(value)) return "";
  if (isUserAuthoredEvent(value) || isUserInputEvent(value) || isToolOrCommandEvent(value))
    return "";
  const text = extractAssistantMessageText(value);
  if (isEchoOfUserInput(text, userText)) return "";
  return text;
}

function isAssistantMessageEvent(value: unknown): boolean {
  const type = firstString(
    path(value, ["params", "item", "type"]),
    path(value, ["item", "type"]),
    path(value, ["type"]),
  ).toLowerCase();
  const method = firstString(path(value, ["method"]), path(value, ["type"])).toLowerCase();
  if (isToolOrCommandType(type || method) || /reasoning|thought|analysis/.test(type)) return false;
  const role = firstString(
    path(value, ["role"]),
    path(value, ["params", "role"]),
    path(value, ["message", "role"]),
    path(value, ["params", "message", "role"]),
    path(value, ["params", "item", "role"]),
    path(value, ["params", "item", "author", "role"]),
    path(value, ["params", "item", "message", "role"]),
    path(value, ["item", "role"]),
    path(value, ["item", "author", "role"]),
    path(value, ["author", "role"]),
  ).toLowerCase();
  if (role === "assistant" || role === "agent") return true;
  if (type === "message") {
    const content =
      path(value, ["params", "item", "content"]) ??
      path(value, ["item", "content"]) ??
      path(value, ["content"]);
    if (assistantContentToText(content)) return true;
  }
  return /assistant|agent[ _-]?message|message[ _-]?delta|response[ _-]?delta|output[ _-]?delta|output_text/.test(
    method,
  );
}

function extractAssistantMessageText(value: unknown): string {
  const direct = firstString(
    path(value, ["delta"]),
    path(value, ["message", "content"]),
    path(value, ["params", "delta"]),
    path(value, ["params", "message", "content"]),
  );
  if (direct) return direct;
  const itemContent =
    path(value, ["params", "item", "content"]) ??
    path(value, ["item", "content"]) ??
    path(value, ["content"]);
  const text = assistantContentToText(itemContent);
  if (text) return text;
  return firstString(
    path(value, ["text"]),
    path(value, ["params", "text"]),
    path(value, ["params", "item", "text"]),
  );
}

function assistantContentToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!entry || typeof entry !== "object") return "";
      const record = entry as Record<string, unknown>;
      const type = firstString(record.type, record.kind).toLowerCase();
      if (type && type !== "text" && type !== "output_text" && type !== "assistant_text") return "";
      return firstString(record.text, record.content, record.delta);
    })
    .filter(Boolean)
    .join("");
}

function isToolOrCommandEvent(value: unknown): boolean {
  const method = firstString(path(value, ["method"]), path(value, ["type"]));
  const type = firstString(
    path(value, ["params", "item", "type"]),
    path(value, ["item", "type"]),
    path(value, ["params", "type"]),
    path(value, ["type"]),
  );
  return isToolOrCommandType(method) || isToolOrCommandType(type);
}

function isToolOutputDeltaEvent(value: unknown): boolean {
  const method = firstString(path(value, ["method"]), path(value, ["type"]));
  const type = firstString(
    path(value, ["params", "item", "type"]),
    path(value, ["item", "type"]),
    path(value, ["params", "type"]),
    path(value, ["type"]),
  );
  return /output[ _/-]?delta|stdout[ _/-]?delta|stderr[ _/-]?delta/i.test(`${method} ${type}`);
}

function isToolOrCommandType(value: string): boolean {
  return /tool|command|exec|shell|patch|file_change|function_call|local_shell|stdout|stderr/i.test(
    value,
  );
}

function isIgnorableRuntimeEvent(method: string): boolean {
  return /turn\/(completed|failed|cancelled)|session|initialized|heartbeat|^item\/(started|updated|completed)$/i.test(
    method,
  );
}

function isNoisyRuntimeEvent(method: string, value: unknown): boolean {
  const type = firstString(
    path(value, ["params", "item", "type"]),
    path(value, ["item", "type"]),
    path(value, ["type"]),
  );
  const text = `${method} ${type}`.toLowerCase();
  return /status|rate.?limit|token.?usage|usage.?updated|plan.?updated|mcp|startup|started|agent[ _-]?message|message[ _-]?delta|response[ _-]?delta/.test(
    text,
  );
}

function isReasoningEvent(value: unknown): boolean {
  const type = firstString(
    path(value, ["params", "item", "type"]),
    path(value, ["item", "type"]),
    path(value, ["type"]),
  ).toLowerCase();
  return /reasoning|thought|analysis/.test(type);
}

function runtimeEventKey(value: unknown): string {
  return firstString(
    path(value, ["id"]),
    path(value, ["params", "id"]),
    path(value, ["params", "item", "id"]),
    path(value, ["params", "callId"]),
    path(value, ["params", "call_id"]),
    path(value, ["params", "item", "callId"]),
    path(value, ["params", "item", "call_id"]),
  );
}

function toolOrCommandName(value: unknown): string {
  const command = path(value, ["params", "command"]);
  if (Array.isArray(command) && command.length)
    return command.map((part) => String(part)).join(" ");
  return firstString(
    path(value, ["params", "tool"]),
    path(value, ["params", "toolName"]),
    path(value, ["params", "tool_name"]),
    path(value, ["params", "name"]),
    path(value, ["params", "item", "name"]),
    path(value, ["params", "item", "toolName"]),
    path(value, ["params", "item", "command"]),
    path(value, ["params", "call", "name"]),
    path(value, ["params", "toolCall", "name"]),
    path(value, ["method"]),
  );
}

function summarizeRuntimePayload(value: unknown): string {
  const result =
    path(value, ["result"]) ??
    path(value, ["params", "result"]) ??
    path(value, ["params", "item", "result"]) ??
    path(value, ["params", "output"]) ??
    path(value, ["params", "item", "output"]);
  const text = firstString(
    extractErrorText(value),
    typeof result === "string" ? result : "",
    path(value, ["params", "summary"]),
    path(value, ["params", "item", "summary"]),
    path(value, ["params", "item", "status"]),
  );
  return truncateText(
    text || humanizeEventName(firstString(path(value, ["method"]), path(value, ["type"]))),
    160,
  );
}

function extractErrorText(value: unknown): string {
  return firstString(
    path(value, ["error", "message"]),
    path(value, ["error"]),
    path(value, ["params", "error", "message"]),
    path(value, ["params", "error"]),
    path(value, ["params", "item", "error"]),
  );
}

function humanizeEventName(value: string): string {
  const cleaned = String(value || "")
    .replace(/^item\//, "")
    .replace(/^turn\//, "")
    .replace(/[._/-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Runtime event";
}

function compactSession(value: unknown): string {
  const text = String(value || "");
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}

function truncateText(value: string, maxLength: number): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function isUserAuthoredEvent(value: unknown): boolean {
  const role = firstString(
    path(value, ["role"]),
    path(value, ["params", "role"]),
    path(value, ["message", "role"]),
    path(value, ["params", "message", "role"]),
    path(value, ["params", "item", "role"]),
    path(value, ["params", "item", "author", "role"]),
    path(value, ["params", "item", "message", "role"]),
    path(value, ["item", "role"]),
    path(value, ["item", "author", "role"]),
    path(value, ["author", "role"]),
  ).toLowerCase();
  return role === "user" || role === "human";
}

function isUserInputEvent(value: unknown): boolean {
  const type = firstString(
    path(value, ["type"]),
    path(value, ["params", "type"]),
    path(value, ["params", "item", "type"]),
    path(value, ["item", "type"]),
  ).toLowerCase();
  if (type === "user" || type === "user_message" || type === "input_text") return true;
  const content =
    path(value, ["params", "item", "content"]) ??
    path(value, ["params", "content"]) ??
    path(value, ["item", "content"]) ??
    path(value, ["content"]);
  return contentContainsUserInput(content);
}

function contentContainsUserInput(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    const type = firstString(record.type, record.kind).toLowerCase();
    const role = firstString(record.role, path(record, ["author", "role"])).toLowerCase();
    return role === "user" || role === "human" || type === "input_text" || type === "user_text";
  });
}

function isEchoOfUserInput(text: string, userText: string): boolean {
  const normalizedText = normalizeMessageText(text);
  const normalizedUserText = normalizeMessageText(userText);
  return !!normalizedText && !!normalizedUserText && normalizedText === normalizedUserText;
}

function normalizeMessageText(text: string): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function nextAssistantDelta(current: string, extracted: string): string {
  if (!extracted) return "";
  if (extracted === current) return "";
  if (extracted.startsWith(current)) return extracted.slice(current.length);
  if (current.endsWith(extracted)) return "";
  return extracted;
}

function extractPlan(value: unknown): unknown {
  return (
    path(value, ["plan"]) ??
    path(value, ["params", "plan"]) ??
    path(value, ["params", "item", "plan"]) ??
    path(value, ["item", "plan"])
  );
}

function extractText(value: unknown): string {
  const direct = firstString(
    path(value, ["delta"]),
    path(value, ["text"]),
    path(value, ["content"]),
    path(value, ["message", "content"]),
    path(value, ["params", "delta"]),
    path(value, ["params", "text"]),
    path(value, ["params", "content"]),
    path(value, ["params", "message", "content"]),
    path(value, ["params", "item", "text"]),
  );
  if (direct) return direct;
  const itemContent = path(value, ["params", "item", "content"]);
  const text = contentToText(itemContent);
  if (text) return text;
  return contentToText(path(value, ["content"]));
}

function contentToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!entry || typeof entry !== "object") return "";
      return firstString(
        (entry as Record<string, unknown>).text,
        (entry as Record<string, unknown>).content,
        (entry as Record<string, unknown>).delta,
      );
    })
    .filter(Boolean)
    .join("");
}

function path(value: unknown, segments: string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
