import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";
import { parseSettings } from "../src/config/schema.js";
import { classifySlackMessage } from "../src/slack/intents.js";
import { parseSlackPayload, verifySlackSignature } from "../src/slack/verify.js";

describe("slack integration helpers", () => {
  test("parses Slack and GitHub settings from workflow config and env", () => {
    const settings = parseSettings(
      {
        tracker: { kind: "memory" },
        slack: {
          enabled: true,
          bot_token: "$SLACK_BOT_TOKEN",
          signing_secret: "$SLACK_SIGNING_SECRET",
          allowed_channel_ids: ["C123"],
          artifact_roots: ["./artifacts"],
        },
        github: { enabled: true, allowed_repo_roots: ["./repo"] },
      },
      "/tmp/stark/WORKFLOW.md",
      {
        SLACK_BOT_TOKEN: "xoxb-token",
        SLACK_SIGNING_SECRET: "secret",
      },
    );
    expect(settings.slack.enabled).toBe(true);
    expect(settings.slack.botToken).toBe("xoxb-token");
    expect(settings.slack.signingSecret).toBe("secret");
    expect(settings.slack.allowedChannelIds).toEqual(["C123"]);
    expect(settings.slack.artifactRoots[0]).toBe("/tmp/stark/artifacts");
    expect(settings.github.allowedRepoRoots[0]).toBe("/tmp/stark/repo");
  });

  test("verifies Slack signatures before parsing payloads", () => {
    const body = "token=ignored&team_id=T1&channel_id=C1&user_id=U1&text=status";
    const timestamp = "1700000000";
    const signature = `v0=${createHmac("sha256", "secret")
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`;
    const request = verifySlackSignature(
      Buffer.from(body),
      {
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature,
        "content-type": "application/x-www-form-urlencoded",
      },
      "secret",
      1700000000,
    );
    expect(parseSlackPayload(request)).toMatchObject({
      channel_id: "C1",
      user_id: "U1",
      text: "status",
    });
  });

  test("rejects invalid Slack signatures", () => {
    expect(() =>
      verifySlackSignature(
        Buffer.from("text=status"),
        {
          "x-slack-request-timestamp": "1700000000",
          "x-slack-signature": "v0=bad",
        },
        "secret",
        1700000000,
      ),
    ).toThrow("invalid_slack_signature");
  });

  test("answers capability questions without queuing an agent task", () => {
    expect(classifySlackMessage("what can you do for me")).toMatchObject({
      kind: "reply",
    });
  });

  test("routes natural artifact requests to the artifact command", () => {
    expect(classifySlackMessage("send the anvil-graphic images we made")).toMatchObject({
      kind: "command",
      text: "artifact anvil-graphic images we made",
    });
  });

  test("queues concrete repo work as an agent task", () => {
    expect(classifySlackMessage("fix the failing workflow tests")).toEqual({
      kind: "task",
      task: "fix the failing workflow tests",
    });
  });

  test("queues informational requests without an ask prefix", () => {
    expect(classifySlackMessage("find github profile of preetam gaikwad")).toEqual({
      kind: "task",
      task: "find github profile of preetam gaikwad",
    });
  });

  test("strips a legacy ask prefix before queuing", () => {
    expect(classifySlackMessage("ask find github profile of preetam gaikwad")).toEqual({
      kind: "task",
      task: "find github profile of preetam gaikwad",
    });
  });
});
