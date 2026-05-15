import type { Settings } from "../types.js";
import { LinearClient, MemoryTracker, type TrackerAdapter } from "./linear.js";

export function createTracker(settingsProvider: () => Settings): TrackerAdapter {
  let memoryTracker: MemoryTracker | null = null;
  let linearClient: LinearClient | null = null;
  const adapter = (): TrackerAdapter => {
    const kind = settingsProvider().tracker.kind;
    if (kind === "memory") {
      memoryTracker ??= new MemoryTracker();
      return memoryTracker;
    }
    linearClient ??= new LinearClient(settingsProvider);
    return linearClient;
  };

  return {
    fetchCandidateIssues: () => adapter().fetchCandidateIssues(),
    fetchIssuesByStates: (stateNames) => adapter().fetchIssuesByStates(stateNames),
    fetchIssueStatesByIds: (issueIds) => adapter().fetchIssueStatesByIds(issueIds),
    fetchCommentReplyCandidates: (stateNameOverride, commentCursors) =>
      adapter().fetchCommentReplyCandidates(stateNameOverride, commentCursors),
    graphql: (query, variables) => adapter().graphql(query, variables),
  };
}

export { LinearClient, MemoryTracker, type TrackerAdapter };
