import express, { type Router } from "express";
import type { Orchestrator } from "../orchestrator.js";
import type { Logger } from "../logging/logger.js";
import type { Settings } from "../types.js";
import { ApprovalStore } from "./approvals.js";
import { SlackClient } from "./client.js";
import { SlackCommandRouter } from "./commands.js";
import { GitHubPrService } from "./github.js";
import { SlackNotifier } from "./notifier.js";
import { parseSlackPayload, verifySlackSignature } from "./verify.js";

export interface SlackIntegration {
  router: Router;
  start(): void;
}

export function createSlackIntegration(
  settingsProvider: () => Settings,
  orchestrator: Orchestrator,
  logger: Logger,
): SlackIntegration | null {
  if (!settingsProvider().slack.enabled) return null;
  const slack = new SlackClient(() => settingsProvider().slack.botToken);
  const approvals = new ApprovalStore();
  const github = new GitHubPrService(
    () => settingsProvider().github.allowedRepoRoots,
    () => settingsProvider().github.prTimeoutMs,
  );
  const commands = new SlackCommandRouter(
    settingsProvider,
    orchestrator,
    slack,
    approvals,
    github,
    logger,
  );
  const router = express.Router();

  router.post(
    ["/commands", "/events", "/interactions"],
    express.raw({ type: ["application/json", "application/x-www-form-urlencoded"] }),
    async (request, response) => {
      try {
        logger.info("Slack request received", { path: request.path });
        const signingSecret = settingsProvider().slack.signingSecret;
        if (!signingSecret) throw new Error("missing_slack_signing_secret");
        const verified = verifySlackSignature(
          Buffer.isBuffer(request.body) ? request.body : Buffer.from(""),
          request.headers,
          signingSecret,
        );
        const payload = parseSlackPayload(verified) as Record<string, unknown>;
        if (request.path === "/events") {
          if (payload.type === "url_verification") {
            response.json({ challenge: payload.challenge });
            return;
          }
          response.status(200).send("");
          await commands.handleEvent(payload);
          return;
        }
        if (request.path === "/interactions") {
          response.json(await commands.handleInteraction(payload));
          return;
        }
        response.json(await commands.handleSlashCommand(payload));
      } catch (reason) {
        logger.warn("Slack request failed", { path: request.path, reason: String(reason) });
        response.status(401).json({ error: "slack_request_rejected" });
      }
    },
  );

  return {
    router,
    start: () => new SlackNotifier(orchestrator, settingsProvider, slack).start(),
  };
}
