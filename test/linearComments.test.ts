import { describe, expect, test } from "vitest";
import {
  commentWatchQuery,
  findReplyToBotComment,
  latestCommentId,
} from "../src/tracker/linearComments.js";

describe("linear comment replies", () => {
  const botUserId = "bot-1";

  test("detects a human reply to a bot comment after the cursor", () => {
    const comments = [
      {
        id: "c1",
        body: "Plan posted",
        createdAt: "2026-01-01T10:00:00.000Z",
        userId: botUserId,
        userName: "Bot",
        parentId: null,
        parentUserId: null,
      },
      {
        id: "c2",
        body: "Can you clarify step 2?",
        createdAt: "2026-01-01T11:00:00.000Z",
        userId: "human-1",
        userName: "Alex",
        parentId: "c1",
        parentUserId: botUserId,
      },
    ];
    expect(findReplyToBotComment(comments, botUserId, "c1")).toMatchObject({
      replyCommentId: "c2",
      replyBody: "Can you clarify step 2?",
    });
    expect(findReplyToBotComment(comments, botUserId, "c2")).toBeNull();
  });

  test("ignores replies to other users", () => {
    const comments = [
      {
        id: "c1",
        body: "Human note",
        createdAt: "2026-01-01T10:00:00.000Z",
        userId: "human-2",
        userName: "Sam",
        parentId: null,
        parentUserId: null,
      },
      {
        id: "c2",
        body: "Following up",
        createdAt: "2026-01-01T11:00:00.000Z",
        userId: "human-1",
        userName: "Alex",
        parentId: "c1",
        parentUserId: "human-2",
      },
    ];
    expect(findReplyToBotComment(comments, botUserId, null)).toBeNull();
  });

  test("commentWatchQuery uses non-terminal filter by default", () => {
    const watch = commentWatchQuery(null);
    expect(watch.query).toContain("nin: [completed, canceled]");
    expect(watch.variables).toEqual({});
  });

  test("commentWatchQuery uses state override when provided", () => {
    const watch = commentWatchQuery(["Human Review", "Todo"]);
    expect(watch.query).toContain("name: {in: $stateNames}");
    expect(watch.variables).toEqual({ stateNames: ["Human Review", "Todo"] });
  });

  test("latestCommentId returns newest comment", () => {
    const comments = [
      {
        id: "c1",
        body: "a",
        createdAt: "2026-01-01T10:00:00.000Z",
        userId: "u",
        userName: null,
        parentId: null,
        parentUserId: null,
      },
      {
        id: "c2",
        body: "b",
        createdAt: "2026-01-02T10:00:00.000Z",
        userId: "u",
        userName: null,
        parentId: null,
        parentUserId: null,
      },
    ];
    expect(latestCommentId(comments)).toBe("c2");
  });
});
