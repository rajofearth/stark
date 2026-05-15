export type SlackIntent =
  | { kind: "command"; text: string }
  | { kind: "reply"; text: string }
  | { kind: "task"; task: string };

const knownCommands = new Set([
  "",
  "help",
  "status",
  "refresh",
  "issue",
  "send",
  "artifact",
  "artifacts",
  "approve",
  "reject",
  "approvals",
  "pr",
  "new-project",
  "project",
]);

export function stripAskPrefix(rawText: string): string {
  const text = normalizeWhitespace(rawText);
  if (/^ask$/i.test(text)) return "";
  const match = text.match(/^ask\s+([\s\S]+)$/i);
  return match ? normalizeWhitespace(match[1]) : text;
}

export function classifySlackMessage(rawText: string, commandName = "/stark"): SlackIntent {
  const text = stripAskPrefix(rawText);
  if (!text) return { kind: "reply", text: helpText(commandName) };
  const parsed = parseCommand(text);
  if (parsed.name === "send") {
    const query = cleanActionQuery(parsed.args, [
      "me",
      "the",
      "a",
      "an",
      "please",
      "pls",
      "to",
      "here",
      "there",
    ]);
    return query ? { kind: "command", text: `artifact ${query}` } : { kind: "command", text };
  }
  if (knownCommands.has(parsed.name)) return { kind: "command", text };
  if (!text) return { kind: "reply", text: helpText(commandName) };
  if (isGreeting(text) || isCapabilityQuestion(text)) {
    return { kind: "reply", text: capabilityText(commandName) };
  }
  if (isStatusQuestion(text)) return { kind: "command", text: "status" };
  if (isApprovalQuestion(text)) return { kind: "command", text: "approvals" };
  if (isRefreshRequest(text)) return { kind: "command", text: "refresh" };

  const artifactQuery = artifactQueryFrom(text);
  if (artifactQuery) return { kind: "command", text: `artifact ${artifactQuery}` };

  const projectRequest = projectRequestFrom(text);
  if (projectRequest) return { kind: "command", text: `new-project ${projectRequest}` };

  return { kind: "task", task: text };
}

export function isKnownCommand(name: string): boolean {
  return knownCommands.has(name);
}

export function helpText(commandName: string): string {
  return [
    `Usage: ${commandName} <command>`,
    "Commands: help, status, refresh, issue <id>, artifact <keywords>, approvals, approve <id>, reject <id>, pr <repo-path> [title], new-project <instructions>",
  ].join("\n");
}

export function capabilityText(commandName: string): string {
  return [
    "I can help from Slack without turning every message into a long agent run.",
    "",
    "Quick replies: ask what I can do, check status, list approvals, or refresh.",
    "Artifacts: say `send the anvil graphic` and I will look in configured artifact folders.",
    "Agent work: mention me with your request, or use a slash command with the task text.",
    "Projects and PRs: use `new-project <instructions>` or `pr <repo-path> [title]`.",
    "",
    `Try \`${commandName} status\` or @mention me with what you want done.`,
  ].join("\n");
}

function parseCommand(text: string): { name: string; args: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { name: (match?.[1] ?? "").toLowerCase(), args: match?.[2] ?? "" };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isGreeting(text: string): boolean {
  return /^(h+[ei]+y?|hi|hey|hello|yo|sup|gm|good\s+(morning|afternoon|evening))(\s+(bud|buddy|bro|there|stark))?[\s!.]*$/i.test(
    text,
  );
}

function isCapabilityQuestion(text: string): boolean {
  return /\b(what|wat|wht)\s+(can|could)\s+(you|u)\s+do\b/i.test(text);
}

function isStatusQuestion(text: string): boolean {
  return /\b(status|running|active agents?|queue|queued jobs?|how'?s it going|what'?s happening)\b/i.test(
    text,
  );
}

function isApprovalQuestion(text: string): boolean {
  return /\b(approvals?|pending approvals?|waiting for approval)\b/i.test(text);
}

function isRefreshRequest(text: string): boolean {
  return /^(refresh|sync|poll|check again)\b/i.test(text);
}

function artifactQueryFrom(text: string): string | null {
  const artifactWords =
    /\b(artifact|artifacts|image|images|graphic|graphics|screenshot|screenshots|png|jpg|jpeg|file|files)\b/i;
  const sendWords = /\b(send|share|upload|find|show|post|drop)\b/i;
  if (!artifactWords.test(text) || !sendWords.test(text)) return null;
  return cleanActionQuery(text, [
    "send",
    "share",
    "upload",
    "find",
    "show",
    "post",
    "drop",
    "me",
    "the",
    "a",
    "an",
    "please",
    "pls",
    "to",
    "here",
    "there",
  ]);
}

function projectRequestFrom(text: string): string | null {
  if (!/\b(start|create|bootstrap|make)\b/i.test(text)) return null;
  if (!/\b(new project|project|app|repo|repository)\b/i.test(text)) return null;
  return cleanActionQuery(text, [
    "start",
    "create",
    "bootstrap",
    "make",
    "a",
    "an",
    "new",
    "please",
  ]);
}

function cleanActionQuery(text: string, dropWords: string[]): string | null {
  const drop = new Set(dropWords.map((word) => word.toLowerCase()));
  const cleaned = text
    .split(/\s+/)
    .filter((word) => !drop.has(word.toLowerCase().replace(/[^\w-]/g, "")))
    .join(" ")
    .replace(/[?.!]+$/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
