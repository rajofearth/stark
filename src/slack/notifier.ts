import type { Orchestrator } from "../orchestrator.js";
import type { Settings } from "../types.js";
import type { SlackClient } from "./client.js";

const userVisibleEvents = new Set(["worker_completed", "worker_failed"]);

export class SlackNotifier {
  private seen = new Set<string>();

  constructor(
    private readonly orchestrator: Orchestrator,
    private readonly settingsProvider: () => Settings,
    private readonly slack: SlackClient,
  ) {}

  start(): void {
    this.orchestrator.on("updated", () => void this.flush().catch(() => undefined));
  }

  private async flush(): Promise<void> {
    if (!this.settingsProvider().slack.enabled) return;
    const snapshot = this.orchestrator.snapshot();
    const events = Array.isArray(snapshot.recent_events) ? snapshot.recent_events : [];
    for (const event of [...events].reverse()) {
      const row = event as Record<string, unknown>;
      const issueId = typeof row.issue_id === "string" ? row.issue_id : null;
      const eventName = typeof row.event === "string" ? row.event : "";
      const at = typeof row.at === "string" ? row.at : "";
      if (!issueId || !userVisibleEvents.has(eventName)) continue;
      const key = `${at}:${issueId}:${eventName}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const metadata = this.orchestrator.adHocMetadata(issueId);
      if (!metadata?.channel) continue;
      const message = String(row.message ?? eventName);
      await this.slack.postMessage({
        channel: metadata.channel,
        threadTs: metadata.threadTs,
        text: eventName === "worker_failed" ? `Agent failed: ${message}` : message,
      });
    }
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-250));
  }
}
