import { createHmac, timingSafeEqual } from "node:crypto";

const signatureVersion = "v0";
const maxClockSkewSeconds = 60 * 5;

export interface SlackRequest {
  body: string;
  contentType: string;
}

export function verifySlackSignature(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  signingSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SlackRequest {
  const timestamp = singleHeader(headers["x-slack-request-timestamp"]);
  const signature = singleHeader(headers["x-slack-signature"]);
  if (!timestamp || !signature) throw new Error("missing_slack_signature");
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw new Error("invalid_slack_timestamp");
  if (Math.abs(nowSeconds - timestampSeconds) > maxClockSkewSeconds) {
    throw new Error("stale_slack_signature");
  }
  const body = rawBody.toString("utf8");
  const expected = `${signatureVersion}=${createHmac("sha256", signingSecret)
    .update(`${signatureVersion}:${timestamp}:${body}`)
    .digest("hex")}`;
  if (!safeEqual(signature, expected)) throw new Error("invalid_slack_signature");
  return {
    body,
    contentType: singleHeader(headers["content-type"]) ?? "",
  };
}

export function parseSlackPayload(request: SlackRequest): unknown {
  if (request.contentType.includes("application/json")) return JSON.parse(request.body || "{}");
  const params = new URLSearchParams(request.body);
  const interactivePayload = params.get("payload");
  if (interactivePayload) return JSON.parse(interactivePayload);
  return Object.fromEntries(params.entries());
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
