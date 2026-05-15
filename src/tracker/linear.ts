import type { Issue, Settings } from "../types.js";
import {
  commentWatchQuery,
  findReplyToBotComment,
  latestCommentId,
  normalizeLinearComments,
  type CommentPollResult,
  type IssueWithCommentReply,
} from "./linearComments.js";

const ISSUE_PAGE_SIZE = 50;
const COMMENT_PAGE_SIZE = 100;
const QUERY = `
query StarkLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $relationFirst: Int!, $after: String) {
  issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
    nodes {
      id identifier title description priority branchName url createdAt updatedAt
      state { name }
      assignee { id }
      labels { nodes { name } }
      inverseRelations(first: $relationFirst) {
        nodes { type issue { id identifier state { name } } }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

const VIEWER_QUERY = `query StarkViewer { viewer { id } }`;

const QUERY_BY_IDS = `
query StarkLinearIssuesById($ids: [ID!]!, $first: Int!, $relationFirst: Int!) {
  issues(filter: {id: {in: $ids}}, first: $first) {
    nodes {
      id identifier title description priority branchName url createdAt updatedAt
      state { name }
      assignee { id }
      labels { nodes { name } }
      inverseRelations(first: $relationFirst) {
        nodes { type issue { id identifier state { name } } }
      }
    }
  }
}`;

export interface TrackerAdapter {
  fetchCandidateIssues(): Promise<Issue[]>;
  fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
  fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]>;
  fetchCommentReplyCandidates(
    stateNameOverride: string[] | null,
    commentCursors: ReadonlyMap<string, string>,
  ): Promise<CommentPollResult>;
  graphql(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class LinearClient implements TrackerAdapter {
  private authenticatedUserId: string | null = null;
  private authenticatedUserIdPromise: Promise<string | null> | null = null;

  constructor(private readonly settingsProvider: () => Settings) {}

  async fetchCandidateIssues(): Promise<Issue[]> {
    const tracker = this.settingsProvider().tracker;
    requireLinearConfig(tracker.apiKey, tracker.projectSlug);
    return this.fetchByStates(
      tracker.projectSlug!,
      tracker.activeStates,
      await this.assigneeFilter(),
    );
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    const uniqueStates = [...new Set(stateNames.map(String))];
    if (uniqueStates.length === 0) return [];
    const tracker = this.settingsProvider().tracker;
    requireLinearConfig(tracker.apiKey, tracker.projectSlug);
    return this.fetchByStates(tracker.projectSlug!, uniqueStates, null);
  }

  async fetchCommentReplyCandidates(
    stateNameOverride: string[] | null,
    commentCursors: ReadonlyMap<string, string>,
  ): Promise<CommentPollResult> {
    const tracker = this.settingsProvider().tracker;
    requireLinearConfig(tracker.apiKey, tracker.projectSlug);
    const botUserId = await this.resolveAuthenticatedUserId();
    if (!botUserId) return { baselines: [], replies: [] };
    const override =
      stateNameOverride && stateNameOverride.length > 0
        ? [...new Set(stateNameOverride.map(String))]
        : null;
    const { query, variables: watchVariables } = commentWatchQuery(override);
    const assigneeFilter = await this.assigneeFilter();
    let after: string | null = null;
    const baselines: CommentPollResult["baselines"] = [];
    const replies: IssueWithCommentReply[] = [];
    do {
      const body = await this.graphql(query, {
        projectSlug: tracker.projectSlug,
        ...watchVariables,
        first: ISSUE_PAGE_SIZE,
        commentsFirst: COMMENT_PAGE_SIZE,
        after,
      });
      const page = getPath<Record<string, unknown>>(body, ["data", "issues"]);
      const nodes = Array.isArray(page?.nodes) ? page.nodes : [];
      for (const node of nodes) {
        const issue = normalizeIssue(node, assigneeFilter);
        if (!issue || issue.assignedToWorker === false) continue;
        const comments = normalizeLinearComments(node);
        if (!commentCursors.has(issue.id)) {
          const cursorCommentId = latestCommentId(comments);
          if (cursorCommentId) baselines.push({ issueId: issue.id, cursorCommentId });
          continue;
        }
        const trigger = findReplyToBotComment(comments, botUserId, commentCursors.get(issue.id)!);
        if (!trigger) continue;
        replies.push({ issue: { ...issue, commentReply: trigger }, trigger });
      }
      const pageInfo = page?.pageInfo as Record<string, unknown> | undefined;
      if (pageInfo?.hasNextPage === true) {
        if (typeof pageInfo.endCursor !== "string") throw new Error("linear_missing_end_cursor");
        after = pageInfo.endCursor;
      } else {
        after = null;
      }
    } while (after);
    return { baselines, replies };
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]> {
    const ids = [...new Set(issueIds)];
    if (ids.length === 0) return [];
    const body = await this.graphql(QUERY_BY_IDS, {
      ids,
      first: ids.length,
      relationFirst: ISSUE_PAGE_SIZE,
    });
    const nodes = getPath<unknown[]>(body, ["data", "issues", "nodes"]) ?? [];
    const assigneeFilter = await this.assigneeFilter();
    return nodes.map((node) => normalizeIssue(node, assigneeFilter)).filter(isIssue);
  }

  async graphql(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const tracker = this.settingsProvider().tracker;
    if (!tracker.apiKey) throw new Error("missing_linear_api_token");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(tracker.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: tracker.apiKey,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const text = await response.text();
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!response.ok) throw new Error(`linear_api_status:${response.status}`);
      if (Array.isArray(body.errors) && body.errors.length > 0) {
        throw new Error(`linear_graphql_errors:${JSON.stringify(body.errors)}`);
      }
      return body;
    } catch (reason) {
      if (reason instanceof Error) throw reason;
      throw new Error(`linear_api_request:${String(reason)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchByStates(
    projectSlug: string,
    stateNames: string[],
    assigneeFilter: string | null,
  ): Promise<Issue[]> {
    let after: string | null = null;
    const issues: Issue[] = [];
    do {
      const body = await this.graphql(QUERY, {
        projectSlug,
        stateNames,
        first: ISSUE_PAGE_SIZE,
        relationFirst: ISSUE_PAGE_SIZE,
        after,
      });
      const page = getPath<Record<string, unknown>>(body, ["data", "issues"]);
      const nodes = Array.isArray(page?.nodes) ? page.nodes : [];
      issues.push(...nodes.map((node) => normalizeIssue(node, assigneeFilter)).filter(isIssue));
      const pageInfo = page?.pageInfo as Record<string, unknown> | undefined;
      if (pageInfo?.hasNextPage === true) {
        if (typeof pageInfo.endCursor !== "string") throw new Error("linear_missing_end_cursor");
        after = pageInfo.endCursor;
      } else {
        after = null;
      }
    } while (after);
    return issues;
  }

  private async assigneeFilter(): Promise<string | null> {
    return this.settingsProvider().tracker.assignee;
  }

  /** Linear user ID for the API token (who posts comments as the agent). */
  async resolveAuthenticatedUserId(): Promise<string | null> {
    if (this.authenticatedUserId) return this.authenticatedUserId;
    if (!this.authenticatedUserIdPromise) {
      this.authenticatedUserIdPromise = this.fetchAuthenticatedUserId();
    }
    this.authenticatedUserId = await this.authenticatedUserIdPromise;
    return this.authenticatedUserId;
  }

  private async fetchAuthenticatedUserId(): Promise<string | null> {
    try {
      const body = await this.graphql(VIEWER_QUERY);
      return stringOrNull(getPath(body, ["data", "viewer", "id"]));
    } catch {
      return null;
    }
  }
}

export class MemoryTracker implements TrackerAdapter {
  constructor(private issues: Issue[] = []) {}

  setIssues(issues: Issue[]): void {
    this.issues = issues;
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    return [...this.issues];
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    const states = new Set(stateNames.map((state) => state.toLowerCase()));
    return this.issues.filter((issue) => states.has(issue.state.toLowerCase()));
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]> {
    const ids = new Set(issueIds);
    return this.issues.filter((issue) => ids.has(issue.id));
  }

  async fetchCommentReplyCandidates(
    _stateNameOverride: string[] | null,
    _commentCursors: ReadonlyMap<string, string>,
  ): Promise<CommentPollResult> {
    return { baselines: [], replies: [] };
  }

  async graphql(): Promise<Record<string, unknown>> {
    return {};
  }
}

export function normalizeIssue(input: unknown, assigneeFilter: string | null = null): Issue | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const id = stringOrNull(raw.id);
  const identifier = stringOrNull(raw.identifier);
  const title = stringOrNull(raw.title);
  const state = stringOrNull(getPath(raw, ["state", "name"]));
  if (!id || !identifier || !title || !state) return null;
  const assigneeId = stringOrNull(getPath(raw, ["assignee", "id"]));
  return {
    id,
    identifier,
    title,
    description: stringOrNull(raw.description),
    priority:
      typeof raw.priority === "number" && Number.isInteger(raw.priority) ? raw.priority : null,
    state,
    branchName: stringOrNull(raw.branchName),
    url: stringOrNull(raw.url),
    labels: normalizeLabels(raw.labels),
    blockedBy: normalizeBlockers(raw.inverseRelations),
    createdAt: parseDate(raw.createdAt),
    updatedAt: parseDate(raw.updatedAt),
    assigneeId,
    assignedToWorker: assigneeFilter ? assigneeId === assigneeFilter : true,
  };
}

function normalizeLabels(labels: unknown): string[] {
  const nodes = getPath<unknown[]>(labels, ["nodes"]) ?? [];
  return nodes
    .map((node) => stringOrNull((node as Record<string, unknown>)?.name))
    .filter((name): name is string => !!name)
    .map((name) => name.toLowerCase());
}

function normalizeBlockers(relations: unknown) {
  const nodes = getPath<unknown[]>(relations, ["nodes"]) ?? [];
  return nodes
    .filter((node) => (node as Record<string, unknown>)?.type === "blocks")
    .map((node) => {
      const issue = (node as Record<string, unknown>).issue as Record<string, unknown> | undefined;
      return {
        id: stringOrNull(issue?.id),
        identifier: stringOrNull(issue?.identifier),
        state: stringOrNull(getPath(issue, ["state", "name"])),
      };
    });
}

function requireLinearConfig(apiKey: string | null, projectSlug: string | null): void {
  if (!apiKey) throw new Error("missing_linear_api_token");
  if (!projectSlug) throw new Error("missing_linear_project_slug");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPath<T>(value: unknown, path: string[]): T | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T;
}

function isIssue(value: Issue | null): value is Issue {
  return value !== null;
}
