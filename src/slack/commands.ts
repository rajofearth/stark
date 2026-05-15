import type { Orchestrator } from "../orchestrator.js";
import type { Logger } from "../logging/logger.js";
import type { Issue, Settings } from "../types.js";
import { ApprovalStore, type ApprovalKind, type ApprovalRequest } from "./approvals.js";
import { findArtifacts, type ArtifactMatch } from "./artifacts.js";
import type { SlackClient } from "./client.js";
import type { GitHubPrService } from "./github.js";
import {
  capabilityText,
  classifySlackMessage,
  helpText,
  isKnownCommand,
  stripAskPrefix,
} from "./intents.js";

interface SlackCommandPayload {
  channel_id?: string;
  channel_name?: string;
  user_id?: string;
  text?: string;
  response_url?: string;
  trigger_id?: string;
}

interface SlackEventPayload {
  type?: string;
  event?: {
    type?: string;
    channel_type?: string;
    text?: string;
    channel?: string;
    user?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
  };
}

type CommandResponse = {
  response_type?: "ephemeral" | "in_channel";
  text: string;
  blocks?: unknown[];
};

export class SlackCommandRouter {
  constructor(
    private readonly settingsProvider: () => Settings,
    private readonly orchestrator: Orchestrator,
    private readonly slack: SlackClient,
    private readonly approvals: ApprovalStore,
    private readonly github: GitHubPrService,
    private readonly logger: Logger,
  ) {}

  async handleSlashCommand(payload: SlackCommandPayload): Promise<CommandResponse> {
    const context = commandContext(payload.channel_id, payload.user_id, null);
    const denied = this.authorize(context);
    if (denied) return denied;
    return this.dispatchSlackText(payload.text ?? "", context);
  }

  async handleEvent(payload: SlackEventPayload): Promise<void> {
    const event = payload.event;
    if (!event) return;
    if (payload.type !== "event_callback" || event.bot_id) return;
    const isMention = event?.type === "app_mention";
    const isDirectMessage = event?.type === "message" && event.channel_type === "im";
    if (!isMention && !isDirectMessage) return;
    const context = commandContext(event.channel, event.user, event.thread_ts ?? event.ts ?? null);
    const denied = this.authorize(context);
    if (denied) {
      await this.slack.postMessage({
        channel: context.channel,
        threadTs: context.threadTs,
        text: denied.text,
      });
      return;
    }
    const text = (event.text ?? "").replace(/<@[^>]+>/g, "").trim();
    const response = await this.dispatchMention(text, context);
    if (!shouldPostSlackResponse(response)) return;
    await this.slack.postMessage({
      channel: context.channel,
      threadTs: context.threadTs,
      text: response.text,
      blocks: response.blocks,
    });
  }

  private async dispatchMention(
    rawText: string,
    context: CommandContext,
  ): Promise<CommandResponse> {
    return this.dispatchSlackText(rawText, context);
  }

  private async dispatchSlackText(
    rawText: string,
    context: CommandContext,
  ): Promise<CommandResponse> {
    const text = stripAskPrefix(rawText);
    if (!text) return ephemeral("Say what you want me to do.");
    const { name } = parseCommand(text);
    if (isKnownCommand(name)) return this.dispatchCommand(text, context);
    const intent = classifySlackMessage(text, this.settingsProvider().slack.commandName);
    if (intent.kind === "reply") return ephemeral(intent.text);
    if (intent.kind === "command") return this.dispatchCommand(intent.text, context);
    return this.ask(intent.task, context);
  }

  async handleInteraction(payload: Record<string, unknown>): Promise<CommandResponse> {
    const user = objectValue(payload.user);
    const channel = objectValue(payload.channel);
    const context = commandContext(
      stringValue(channel?.id),
      stringValue(user?.id),
      stringValue(payload.message_ts),
    );
    const denied = this.authorize(context);
    if (denied) return denied;
    const action = firstAction(payload);
    if (!action) return ephemeral("No action found.");
    const approval = this.approvals.consume(action.value);
    if (!approval) return ephemeral("That approval is no longer pending.");
    if (action.actionId === "stark_reject") {
      return ephemeral(`Rejected ${approval.id}: ${approval.summary}`);
    }
    return this.executeApproval(approval);
  }

  private async dispatchCommand(
    rawText: string,
    context: CommandContext,
  ): Promise<CommandResponse> {
    const { name, args } = parseCommand(rawText);
    try {
      switch (name) {
        case "":
        case "help":
          return ephemeral(capabilityText(this.settingsProvider().slack.commandName));
        case "status":
          return ephemeral(formatStatus(this.orchestrator.snapshot()));
        case "refresh":
          return ephemeral(`Refresh queued: ${JSON.stringify(this.orchestrator.requestRefresh())}`);
        case "issue":
          return this.issue(args);
        case "send":
        case "artifact":
        case "artifacts":
          return this.artifact(args, context);
        case "approve":
          return this.approve(args);
        case "reject":
          return this.reject(args);
        case "approvals":
          return this.listApprovals();
        case "pr":
          return this.pr(args, context);
        case "new-project":
        case "project":
          return this.newProject(args, context);
        default:
          return ephemeral(
            `Unknown command "${name}". Try \`${this.settingsProvider().slack.commandName} help\`.`,
          );
      }
    } catch (reason) {
      this.logger.warn("Slack command failed", { command: name, reason: String(reason) });
      return ephemeral(
        `Command failed: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    }
  }

  private issue(args: string): CommandResponse {
    const identifier = args.trim();
    if (!identifier) return ephemeral("Usage: issue <identifier>");
    const issue = this.orchestrator.issueSnapshot(identifier);
    return ephemeral(
      issue
        ? `\`\`\`${JSON.stringify(issue, null, 2)}\`\`\``
        : `No active issue found for ${identifier}.`,
    );
  }

  private ask(args: string, context: CommandContext): CommandResponse {
    if (!args.trim()) return ephemeral("Say what you want me to do.");
    const payload = { task: args.trim(), context };
    if (this.requiresApproval("ask"))
      return this.requestApproval("ask", context, `Run agent task: ${args.trim()}`, payload);
    return this.enqueueTask(payload);
  }

  private async artifact(args: string, context: CommandContext): Promise<CommandResponse> {
    if (!args.trim()) return ephemeral("Usage: artifact <image name or keywords>");
    const matches = await findArtifacts(this.settingsProvider().slack.artifactRoots, args.trim());
    if (matches.length === 0)
      return ephemeral(`No matching image artifacts found for "${args.trim()}".`);
    if (matches.length > 1) {
      return ephemeral(
        `I found multiple matches. Try a more specific name:\n${matches
          .map((match, index) => `${index + 1}. ${match.name} (${match.path})`)
          .join("\n")}`,
      );
    }
    const payload = { artifact: matches[0], context };
    if (this.requiresApproval("artifact_upload")) {
      return this.requestApproval(
        "artifact_upload",
        context,
        `Upload ${matches[0].name} to Slack`,
        payload,
      );
    }
    await this.uploadArtifact(matches[0], context);
    return ephemeral(`Uploaded ${matches[0].name}.`);
  }

  private approve(args: string): CommandResponse | Promise<CommandResponse> {
    const approval = this.approvals.consume(args.trim());
    if (!approval) return ephemeral("Approval not found.");
    return this.executeApproval(approval);
  }

  private reject(args: string): CommandResponse {
    const approval = this.approvals.consume(args.trim());
    return ephemeral(
      approval ? `Rejected ${approval.id}: ${approval.summary}` : "Approval not found.",
    );
  }

  private listApprovals(): CommandResponse {
    const approvals = this.approvals.list();
    if (approvals.length === 0) return ephemeral("No pending approvals.");
    return ephemeral(
      approvals
        .map((approval) => `${approval.id} [${approval.kind}] ${approval.summary}`)
        .join("\n"),
    );
  }

  private pr(args: string, context: CommandContext): CommandResponse {
    const [repoPath, ...titleParts] = shellWords(args);
    if (!repoPath) return ephemeral("Usage: pr <repo-path> [title]");
    if (!this.settingsProvider().github.enabled)
      return ephemeral("GitHub PR integration is disabled.");
    return this.requestApproval("github_pr", context, `Create GitHub PR from ${repoPath}`, {
      repoPath,
      title: titleParts.join(" ") || undefined,
      context,
    });
  }

  private newProject(args: string, context: CommandContext): CommandResponse {
    if (!args.trim()) return ephemeral("Usage: new-project <name and instructions>");
    return this.requestApproval("new_project", context, `Start new project: ${args.trim()}`, {
      task: `Start a new project from Slack with these instructions:\n\n${args.trim()}`,
      context,
    });
  }

  private requestApproval(
    kind: ApprovalKind,
    context: CommandContext,
    summary: string,
    payload: unknown,
  ): CommandResponse {
    const approval = this.approvals.create({
      kind,
      channel: context.channel,
      user: context.user,
      threadTs: context.threadTs,
      summary,
      payload,
    });
    return {
      response_type: "ephemeral",
      text: `Approval required before I start: ${approval.id} ${summary}`,
      blocks: approvalBlocks(approval),
    };
  }

  private async executeApproval(approval: ApprovalRequest): Promise<CommandResponse> {
    if (approval.kind === "ask" || approval.kind === "new_project") {
      const response = this.enqueueTask(
        approval.payload as { task: string; context: CommandContext },
      );
      if (shouldPostSlackResponse(response)) {
        await this.slack.postMessage({
          channel: approval.channel,
          threadTs: approval.threadTs,
          text: response.text,
          blocks: response.blocks,
        });
      }
      return response;
    }
    if (approval.kind === "artifact_upload") {
      const payload = approval.payload as { artifact: ArtifactMatch; context: CommandContext };
      await this.uploadArtifact(payload.artifact, payload.context);
      return ephemeral(`Uploaded ${payload.artifact.name}.`);
    }
    if (approval.kind === "github_pr") {
      const payload = approval.payload as {
        repoPath: string;
        title?: string;
        context: CommandContext;
      };
      const pr = await this.github.createPullRequest(payload.repoPath, payload.title);
      await this.slack.postMessage({
        channel: payload.context.channel,
        threadTs: payload.context.threadTs,
        text: `Created PR: ${pr.url}`,
      });
      return ephemeral(`Created PR: ${pr.url}`);
    }
    return ephemeral("Unsupported approval kind.");
  }

  private enqueueTask(payload: { task: string; context: CommandContext }): CommandResponse {
    const issue = slackIssue(payload.task, payload.context);
    const result = this.orchestrator.enqueueAdHocIssue(issue, {
      source: "slack",
      channel: payload.context.channel,
      threadTs: payload.context.threadTs,
      user: payload.context.user,
    });
    this.logger.info("Slack task queued", {
      issue_identifier: issue.identifier,
      channel: payload.context.channel,
      thread_ts: payload.context.threadTs,
      queued: Boolean(result.queued),
    });
    if (result.queued) return silent();
    return ephemeral(
      `I couldn’t start ${issue.identifier}: ${String(result.reason ?? "unknown reason")}`,
    );
  }

  private async uploadArtifact(match: ArtifactMatch, context: CommandContext): Promise<void> {
    await this.slack.uploadFile({
      channel: context.channel,
      threadTs: context.threadTs,
      filePath: match.path,
      title: match.name,
      initialComment: `Artifact: ${match.name}`,
    });
  }

  private requiresApproval(kind: ApprovalKind): boolean {
    return this.settingsProvider().slack.requireApprovalFor.includes(kind);
  }

  private authorize(context: CommandContext): CommandResponse | null {
    const settings = this.settingsProvider().slack;
    if (!context.channel || !context.user) return ephemeral("Slack channel or user missing.");
    if (
      settings.allowedChannelIds.length > 0 &&
      !settings.allowedChannelIds.includes(context.channel)
    ) {
      return ephemeral("This Slack channel is not allowed to control S.T.A.R.K.");
    }
    if (settings.allowedUserIds.length > 0 && !settings.allowedUserIds.includes(context.user)) {
      return ephemeral("You are not allowed to control S.T.A.R.K.");
    }
    return null;
  }
}

interface CommandContext {
  channel: string;
  user: string;
  threadTs: string | null;
}

function commandContext(channel?: string, user?: string, threadTs?: string | null): CommandContext {
  return { channel: channel ?? "", user: user ?? "", threadTs: threadTs ?? null };
}

function parseCommand(text: string): { name: string; args: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  return { name: (match?.[1] ?? "").toLowerCase(), args: match?.[2] ?? "" };
}

function ephemeral(text: string): CommandResponse {
  return { response_type: "ephemeral", text };
}

function silent(): CommandResponse {
  return { response_type: "ephemeral", text: "" };
}

function shouldPostSlackResponse(response: CommandResponse): boolean {
  return Boolean(response.text?.trim() || response.blocks?.length);
}

function slackIssue(task: string, context: CommandContext): Issue {
  const id = `slack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const identifier = `SLACK-${id.slice(-6).toUpperCase()}`;
  return {
    id,
    identifier,
    title: task.split(/\r?\n/)[0].slice(0, 120),
    description: [
      task,
      "",
      "Slack context:",
      `- channel: ${context.channel}`,
      `- user: ${context.user}`,
      context.threadTs ? `- thread_ts: ${context.threadTs}` : null,
      "",
      "Slack execution rules:",
      "- Treat this as a Slack-requested ad-hoc job, not a Linear issue.",
      "- Do not query or update Linear unless the Slack request explicitly asks for Linear work.",
      "- If the request only needs an answer, answer directly and stop; do not invent repo changes.",
      "- Run commands only when they materially help inspect, validate, or complete the requested work.",
      "- Your final assistant message is posted directly to this Slack thread as the user-facing reply.",
      "- Write that reply naturally: answer the question or report results directly, without job IDs or placeholder acknowledgments.",
      "- When work is complete, summarize changes, validation, local URLs, blockers, and any PR details in that reply.",
    ]
      .filter(Boolean)
      .join("\n"),
    priority: null,
    state: "Todo",
    branchName: null,
    url: null,
    labels: ["stark-adhoc", "slack"],
    blockedBy: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    assignedToWorker: true,
  };
}

function formatStatus(snapshot: Record<string, unknown>): string {
  const counts = snapshot.counts as Record<string, unknown> | undefined;
  const health = snapshot.health as Record<string, unknown> | undefined;
  const queued = Array.isArray(snapshot.queued) ? snapshot.queued.length : 0;
  return [
    "*S.T.A.R.K status*",
    `Running: ${counts?.running ?? 0}`,
    `Retrying: ${counts?.retrying ?? 0}`,
    `Queued Slack jobs: ${queued}`,
    `Available slots: ${health?.available_slots ?? "n/a"}`,
    `Polling: ${health?.polling ?? "unknown"}`,
  ].join("\n");
}

function approvalBlocks(approval: ApprovalRequest): unknown[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Approval required*\n${approval.id}\n${approval.summary}` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Approve" },
          style: "primary",
          action_id: "stark_approve",
          value: approval.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reject" },
          style: "danger",
          action_id: "stark_reject",
          value: approval.id,
        },
      ],
    },
  ];
}

function firstAction(payload: Record<string, unknown>): { actionId: string; value: string } | null {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  const first = actions[0] as Record<string, unknown> | undefined;
  const actionId = stringValue(first?.action_id);
  const value = stringValue(first?.value);
  return actionId && value ? { actionId, value } : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function shellWords(input: string): string[] {
  const words = input.match(/"([^"]*)"|'([^']*)'|\S+/g) ?? [];
  return words.map((word) => word.replace(/^["']|["']$/g, ""));
}
