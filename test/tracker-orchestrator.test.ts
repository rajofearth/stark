import { describe, expect, test } from "vitest";
import { normalizeToolCall } from "../src/codex/appServer.js";
import { DynamicToolExecutor } from "../src/codex/dynamicTool.js";
import {
  isHumanReviewState,
  sortIssuesForDispatch,
  summarizeRuntimePayload,
} from "../src/orchestrator.js";
import { MemoryTracker } from "../src/tracker/index.js";
import type { Issue } from "../src/types.js";

describe("tracker and orchestration helpers", () => {
  test("sorts issues by priority, created time, identifier", () => {
    const sorted = sortIssuesForDispatch([
      issue("id-2", "B-2", 2, "2026-01-02T00:00:00Z"),
      issue("id-1", "A-1", 1, "2026-01-03T00:00:00Z"),
      issue("id-3", "A-0", 1, "2026-01-01T00:00:00Z"),
    ]);
    expect(sorted.map((item) => item.identifier)).toEqual(["A-0", "A-1", "B-2"]);
  });

  test("linear_graphql dynamic tool returns structured payloads", async () => {
    const tracker = new MemoryTracker([]);
    const tool = new DynamicToolExecutor(tracker);
    const result = await tool.execute("linear_graphql", { query: "query Test { viewer { id } }" });
    expect(result.success).toBe(true);
    expect(result.contentItems).toEqual([{ type: "inputText", text: "{}" }]);
  });

  test("normalizes app-server tool calls that use direct tool field", () => {
    const normalized = normalizeToolCall({
      tool: "linear_graphql",
      callId: "call-90b",
      arguments: { query: "query Viewer { viewer { id } }" },
    });
    expect(normalized).toEqual({
      toolName: "linear_graphql",
      args: { query: "query Viewer { viewer { id } }" },
    });
  });

  test("recognizes Human Review as a parked state", () => {
    expect(isHumanReviewState("Human Review")).toBe(true);
    expect(isHumanReviewState(" human review ")).toBe(true);
    expect(isHumanReviewState("Merging")).toBe(false);
  });

  test("summarizes readable Codex notification text", () => {
    expect(
      summarizeRuntimePayload({
        method: "item/updated",
        params: {
          item: {
            type: "assistant_message",
            content: [{ type: "text", text: "Created the project and started the dev server." }],
          },
        },
      }),
    ).toBe("Created the project and started the dev server.");
  });

  test("summarizes Codex agentMessage final answers", () => {
    expect(
      summarizeRuntimePayload({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            text: "Built the app and validated it.",
            phase: "final_answer",
          },
        },
      }),
    ).toBe("Built the app and validated it.");
  });
});

function issue(id: string, identifier: string, priority: number, createdAt: string): Issue {
  return {
    id,
    identifier,
    title: identifier,
    description: null,
    priority,
    state: "Todo",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: new Date(createdAt),
    updatedAt: null,
    assignedToWorker: true,
  };
}
