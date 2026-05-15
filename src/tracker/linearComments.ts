import type { CommentReplyTrigger, Issue } from "../types.js";

export type { CommentReplyTrigger };

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  parentId: string | null;
  parentUserId: string | null;
}

export interface IssueWithCommentReply {
  issue: Issue;
  trigger: CommentReplyTrigger;
}

export interface CommentPollResult {
  baselines: Array<{ issueId: string; cursorCommentId: string }>;
  replies: IssueWithCommentReply[];
}

const COMMENT_WATCH_NON_TERMINAL_QUERY = `
query StarkCommentWatchNonTerminal($projectSlug: String!, $first: Int!, $after: String, $commentsFirst: Int!) {
  issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {type: {nin: [completed, canceled]}}}, first: $first, after: $after) {
    nodes {
      id identifier title description priority branchName url createdAt updatedAt
      state { name }
      assignee { id }
      labels { nodes { name } }
      inverseRelations(first: 50) {
        nodes { type issue { id identifier state { name } } }
      }
      comments(first: $commentsFirst) {
        nodes {
          id body createdAt updatedAt
          user { id name }
          parent { id user { id } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const COMMENT_WATCH_BY_STATE_NAMES_QUERY = `
query StarkCommentWatchByState($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $after: String, $commentsFirst: Int!) {
  issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
    nodes {
      id identifier title description priority branchName url createdAt updatedAt
      state { name }
      assignee { id }
      labels { nodes { name } }
      inverseRelations(first: 50) {
        nodes { type issue { id identifier state { name } } }
      }
      comments(first: $commentsFirst) {
        nodes {
          id body createdAt updatedAt
          user { id name }
          parent { id user { id } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export function findReplyToBotComment(
  comments: LinearComment[],
  botUserId: string,
  cursorCommentId: string | null,
): CommentReplyTrigger | null {
  if (!botUserId || comments.length === 0) return null;
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const cursorTime = cursorCommentId ? parseTime(byId.get(cursorCommentId)?.createdAt) : null;

  const replies = comments
    .filter((comment) => {
      if (comment.userId === botUserId) return false;
      if (!comment.parentId) return false;
      const parent = byId.get(comment.parentId);
      if (!parent || parent.userId !== botUserId) return false;
      const replyTime = parseTime(comment.createdAt);
      if (replyTime === null) return false;
      if (cursorTime !== null && replyTime <= cursorTime) return false;
      return true;
    })
    .sort((left, right) => (parseTime(left.createdAt) ?? 0) - (parseTime(right.createdAt) ?? 0));

  const latest = replies.at(-1);
  if (!latest) return null;
  const parent = byId.get(latest.parentId!);
  if (!parent) return null;
  return {
    replyCommentId: latest.id,
    replyBody: latest.body,
    replyAuthorName: latest.userName,
    replyCreatedAt: latest.createdAt,
    parentCommentId: parent.id,
    parentBody: parent.body,
  };
}

export function latestCommentId(comments: LinearComment[]): string | null {
  if (comments.length === 0) return null;
  const sorted = [...comments].sort(
    (left, right) => (parseTime(left.createdAt) ?? 0) - (parseTime(right.createdAt) ?? 0),
  );
  return sorted.at(-1)?.id ?? null;
}

export function commentWatchQuery(stateNameOverride: string[] | null): {
  query: string;
  variables: Record<string, unknown>;
} {
  if (stateNameOverride && stateNameOverride.length > 0) {
    return {
      query: COMMENT_WATCH_BY_STATE_NAMES_QUERY,
      variables: { stateNames: stateNameOverride },
    };
  }
  return {
    query: COMMENT_WATCH_NON_TERMINAL_QUERY,
    variables: {},
  };
}

export function normalizeLinearComments(raw: unknown): LinearComment[] {
  const nodes = (getPath(raw, ["comments", "nodes"]) as unknown[] | undefined) ?? [];
  const parsed: LinearComment[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    const id = stringOrNull(record.id);
    const body = stringOrNull(record.body);
    const createdAt = stringOrNull(record.createdAt);
    const userId = stringOrNull(getPath(record, ["user", "id"]));
    if (!id || body === null || !createdAt || !userId) continue;
    parsed.push({
      id,
      body,
      createdAt,
      userId,
      userName: stringOrNull(getPath(record, ["user", "name"])),
      parentId: stringOrNull(getPath(record, ["parent", "id"])),
      parentUserId: stringOrNull(getPath(record, ["parent", "user", "id"])),
    });
  }
  return parsed;
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getPath(value: unknown, path: string[]): unknown | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
