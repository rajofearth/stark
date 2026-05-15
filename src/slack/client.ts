import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

export interface SlackMessageOptions {
  channel: string;
  text: string;
  threadTs?: string | null;
  blocks?: unknown[];
}

export class SlackClient {
  constructor(private readonly tokenProvider: () => string | null) {}

  async postMessage(options: SlackMessageOptions): Promise<Record<string, unknown>> {
    return this.api("chat.postMessage", {
      channel: options.channel,
      text: options.text,
      thread_ts: options.threadTs ?? undefined,
      blocks: options.blocks,
    });
  }

  async uploadFile(options: {
    channel: string;
    filePath: string;
    title?: string;
    initialComment?: string;
    threadTs?: string | null;
  }): Promise<Record<string, unknown>> {
    const info = await stat(options.filePath);
    if (!info.isFile()) throw new Error("artifact_not_a_file");
    const filename = basename(options.filePath);
    const upload = await this.api("files.getUploadURLExternal", {
      filename,
      length: info.size,
    });
    const uploadUrl = stringFrom(upload.upload_url);
    const fileId = stringFrom(upload.file_id);
    if (!uploadUrl || !fileId) throw new Error("slack_upload_url_missing");
    const response = await fetch(uploadUrl, {
      method: "POST",
      body: await readFile(options.filePath),
      headers: { "content-type": "application/octet-stream" },
    });
    if (!response.ok) throw new Error(`slack_file_upload_status:${response.status}`);
    return this.api("files.completeUploadExternal", {
      files: [{ id: fileId, title: options.title ?? filename }],
      channel_id: options.channel,
      initial_comment: options.initialComment,
      thread_ts: options.threadTs ?? undefined,
    });
  }

  private async api(
    method: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const token = this.tokenProvider();
    if (!token) throw new Error("missing_slack_bot_token");
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.ok !== true) {
      throw new Error(`slack_api_error:${method}:${payload.error ?? response.status}`);
    }
    return payload;
  }
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
