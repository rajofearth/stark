import type { Settings } from "../types.js";
import { LinearClient, MemoryTracker, type TrackerAdapter } from "./linear.js";

export function createTracker(settingsProvider: () => Settings): TrackerAdapter {
  const kind = settingsProvider().tracker.kind;
  if (kind === "memory") return new MemoryTracker();
  return new LinearClient(settingsProvider);
}

export { LinearClient, MemoryTracker, type TrackerAdapter };
