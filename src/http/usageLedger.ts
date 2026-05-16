import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

/** One appended row when Codex stats increase for a thread (relative deltas).
 * Monetary fields are deltas; estimate is computed at read time from model + tokens. */
export interface UsageLedgerRecord {
  id: string;
  recordedAt: string;
  threadId: string;
  turnId: string | null;
  conversationTitle: string | null;
  model: string;
  inputDelta: number;
  outputDelta: number;
  totalDelta: number;
  /** Delta of cumulative USD from Codex when payload included cost */
  costUsdReportedDelta: number | null;
}

export interface ThreadStatsSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
}

/** Depends on Codex sending monotonically increasing cumulative token totals per thread. */
export function computeUsageDelta(
  prev: ThreadStatsSnapshot | undefined,
  next: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  },
): {
  inputDelta: number;
  outputDelta: number;
  totalDelta: number;
  costUsdDelta: number | null;
} | null {
  const inAbs = typeof next.inputTokens === "number" ? next.inputTokens : null;
  const outAbs = typeof next.outputTokens === "number" ? next.outputTokens : null;
  let totalAbs = typeof next.totalTokens === "number" ? next.totalTokens : null;
  if (totalAbs === null && inAbs !== null && outAbs !== null) totalAbs = inAbs + outAbs;

  if (totalAbs === null && inAbs === null && outAbs === null) {
    const costNext = typeof next.costUsd === "number" ? next.costUsd : null;
    const costPrevVal = prev?.costUsd ?? null;
    if (costNext === null) return null;
    if (costPrevVal === null) {
      const cDelta = Math.max(0, costNext);
      return cDelta > 0
        ? { inputDelta: 0, outputDelta: 0, totalDelta: 0, costUsdDelta: cDelta }
        : null;
    }
    const cDelta = Math.max(0, costNext - costPrevVal);
    return cDelta > 0
      ? { inputDelta: 0, outputDelta: 0, totalDelta: 0, costUsdDelta: cDelta }
      : null;
  }

  const inPrev = prev?.inputTokens ?? 0;
  const outPrev = prev?.outputTokens ?? 0;
  const totalPrev = prev?.totalTokens ?? 0;

  const inNext = inAbs !== null ? inAbs : inPrev;
  const outNext = outAbs !== null ? outAbs : outPrev;
  const totalNext = totalAbs !== null ? totalAbs : inNext + outNext;

  const inputDelta = Math.max(0, inNext - inPrev);
  const outputDelta = Math.max(0, outNext - outPrev);
  const totalDelta = Math.max(0, totalNext - totalPrev);

  let costUsdDelta: number | null = null;
  const costNext = typeof next.costUsd === "number" ? next.costUsd : null;
  if (costNext !== null) {
    const costPrevVal = prev?.costUsd ?? null;
    if (costPrevVal !== null) costUsdDelta = Math.max(0, costNext - costPrevVal);
    else costUsdDelta = costNext;
  }

  if (inputDelta <= 0 && outputDelta <= 0 && totalDelta <= 0 && !(costUsdDelta !== null && costUsdDelta > 0)) {
    return null;
  }

  return { inputDelta, outputDelta, totalDelta, costUsdDelta };
}

export function mergeSnapshots(
  prev: ThreadStatsSnapshot | undefined,
  stats: Record<string, unknown>,
): ThreadStatsSnapshot {
  const readNum = (k: string): number | undefined =>
    typeof stats[k] === "number" && Number.isFinite(stats[k] as number) ? (stats[k] as number) : undefined;

  const inT = readNum("inputTokens");
  const outT = readNum("outputTokens");
  const tot = readNum("totalTokens");
  const cost = readNum("costUsd");

  const inNext = inT !== undefined ? inT : (prev?.inputTokens ?? 0);
  const outNext = outT !== undefined ? outT : (prev?.outputTokens ?? 0);
  let totalNext: number;
  if (tot !== undefined) totalNext = tot;
  else if (inT !== undefined || outT !== undefined) totalNext = inNext + outNext;
  else totalNext = prev?.totalTokens ?? inNext + outNext;

  let costUsd: number | null = prev?.costUsd ?? null;
  if (cost !== undefined) costUsd = cost;

  return {
    inputTokens: inNext,
    outputTokens: outNext,
    totalTokens: totalNext,
    costUsd,
  };
}

export class UsageLedger {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async append(record: Omit<UsageLedgerRecord, "id" | "recordedAt"> & { id?: string }): Promise<void> {
    const line: UsageLedgerRecord = {
      id: record.id ?? randomUUID(),
      recordedAt: new Date().toISOString(),
      threadId: record.threadId,
      turnId: record.turnId,
      conversationTitle: record.conversationTitle,
      model: record.model,
      inputDelta: record.inputDelta,
      outputDelta: record.outputDelta,
      totalDelta: record.totalDelta,
      costUsdReportedDelta: record.costUsdReportedDelta,
    };
    const payload = JSON.stringify(line) + "\n";
    this.writeChain = this.writeChain.then(() => this.appendLine(payload));
    return this.writeChain;
  }

  private async appendLine(payload: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, payload, "utf8");
  }

  async readAll(): Promise<UsageLedgerRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const rows: UsageLedgerRecord[] = [];
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          rows.push(JSON.parse(line) as UsageLedgerRecord);
        } catch {
          /* skip corrupt line */
        }
      }
      return rows;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "ENOENT") return [];
      throw e;
    }
  }

  async readRange(fromMs: number, toMs: number): Promise<UsageLedgerRecord[]> {
    const all = await this.readAll();
    return all.filter((r) => {
      const t = Date.parse(r.recordedAt);
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    });
  }
}

/** Stable row id from thread + turn + token signature (idempotent retries). */
export function usageRowDedupeKey(parts: {
  threadId: string;
  turnId: string | null;
  inputDelta: number;
  outputDelta: number;
  totalDelta: number;
  costUsdReportedDelta: number | null;
}): string {
  const h = createHash("sha256");
  h.update(
    [
      parts.threadId,
      parts.turnId ?? "",
      String(parts.inputDelta),
      String(parts.outputDelta),
      String(parts.totalDelta),
      parts.costUsdReportedDelta === null ? "" : String(parts.costUsdReportedDelta),
    ].join("|"),
  );
  return h.digest("hex").slice(0, 24);
}
