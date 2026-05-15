import { describe, expect, test } from "vitest";
import { parseSettings } from "../src/config/schema.js";
import { buildPrompt, renderCommentReplyPrompt } from "../src/promptBuilder.js";
import {
  buildContinuationPrompt,
  DEFAULT_LINEAR_ORCHESTRATION,
} from "../src/workflow/linearOrchestration.js";
import type { Issue, WorkflowDefinition } from "../src/types.js";

const baseIssue: Issue = {
  id: "issue-1",
  identifier: "ENG-1",
  title: "Add feature",
  description: "Do the thing",
  priority: 2,
  state: "Todo",
  branchName: null,
  url: "https://linear.app/issue/ENG-1",
  labels: [],
  blockedBy: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const slackIssue: Issue = {
  ...baseIssue,
  id: "slack-1",
  identifier: "SLACK-ABC123",
  state: "Todo",
};

function workflowWithTemplate(template: string): WorkflowDefinition {
  return { config: {}, prompt: template, promptTemplate: template };
}

describe("promptBuilder linear orchestration", () => {
  test("includes orchestrator and Todo subagents for linear tasks", async () => {
    const settings = parseSettings({}, "/tmp/WORKFLOW.md");
    const prompt = await buildPrompt(
      workflowWithTemplate("Ticket {{ issue.identifier }}"),
      baseIssue,
      null,
      {
        taskKind: "linear",
        linearOrchestration: settings.agent.linearOrchestration,
      },
    );
    expect(prompt).toContain("ENG-1");
    expect(prompt).toContain("orchestrator");
    expect(prompt).toContain("task_analyzer");
    expect(prompt).toContain("codebase_explorer");
    expect(prompt).toContain("Post the implementation plan");
  });

  test("excludes Linear playbook for ad-hoc Slack tasks", async () => {
    const settings = parseSettings({}, "/tmp/WORKFLOW.md");
    const prompt = await buildPrompt(
      workflowWithTemplate("Slack task {{ issue.identifier }}"),
      slackIssue,
      null,
      {
        taskKind: "adhoc",
        linearOrchestration: settings.agent.linearOrchestration,
      },
    );
    expect(prompt).toContain("SLACK-ABC123");
    expect(prompt).not.toContain("task_analyzer");
    expect(prompt).not.toContain("Linear orchestrator role");
  });

  test("uses custom subagents from workflow config", async () => {
    const settings = parseSettings(
      {
        agent: {
          linear_orchestration: {
            enabled: true,
            phases: {
              todo: {
                subagents: [{ id: "custom_planner", purpose: "Custom planning only" }],
                deliverables: ["Custom deliverable"],
              },
            },
          },
        },
      },
      "/tmp/WORKFLOW.md",
    );
    const prompt = await buildPrompt(
      workflowWithTemplate("{{ issue.identifier }}"),
      baseIssue,
      null,
      {
        taskKind: "linear",
        linearOrchestration: settings.agent.linearOrchestration,
      },
    );
    expect(prompt).toContain("custom_planner");
    expect(prompt).toContain("Custom deliverable");
  });

  test("merging continuation mentions PR and Linear link", () => {
    const continuation = buildContinuationPrompt(
      "linear",
      "Merging",
      2,
      6,
      DEFAULT_LINEAR_ORCHESTRATION,
    );
    expect(continuation).toContain("PR");
    expect(continuation).toContain("Linear");
    expect(continuation).toContain("Merging");
  });

  test("comment reply prompt requires commentCreate and forbids workpad edit", () => {
    const prompt = renderCommentReplyPrompt(baseIssue, {
      replyCommentId: "reply-1",
      replyBody: "Please clarify",
      replyAuthorName: "Alex",
      replyCreatedAt: "2026-01-01T12:00:00.000Z",
      parentCommentId: "parent-1",
      parentBody: "Here is the plan",
    });
    expect(prompt).toContain("commentCreate");
    expect(prompt).toContain("reply-1");
    expect(prompt).toContain("issue-1");
    expect(prompt).toContain("Do **not** use `commentUpdate`");
    expect(prompt).toContain("new threaded comment");
  });

  test("adhoc continuation stays generic", () => {
    const continuation = buildContinuationPrompt(
      "adhoc",
      "Todo",
      2,
      6,
      DEFAULT_LINEAR_ORCHESTRATION,
    );
    expect(continuation).not.toContain("Phase reminder");
    expect(continuation).not.toContain("orchestrator");
  });
});
