import type { Settings } from "../types.js";
import { LinearClient, MemoryTracker, type TrackerAdapter } from "./linear.js";

export function createTracker(settingsProvider: () => Settings): TrackerAdapter {
  let memoryTracker: MemoryTracker | null = null;
  const adapter = (): TrackerAdapter => {
    const kind = settingsProvider().tracker.kind;
    if (kind === "memory") {
      memoryTracker ??= new MemoryTracker();
      return memoryTracker;
    }
    return new LinearClient(settingsProvider);
  };

  return {
    fetchCandidateIssues: () => adapter().fetchCandidateIssues(),
    fetchIssuesByStates: (stateNames) => adapter().fetchIssuesByStates(stateNames),
    fetchIssueStatesByIds: (issueIds) => adapter().fetchIssueStatesByIds(issueIds),
    graphql: (query, variables) => adapter().graphql(query, variables),
  };
}

export { LinearClient, MemoryTracker, type TrackerAdapter };
