import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { estimateUsd, resolveModelKey } from "../src/http/modelPricing.js";
import { publishedModelPricingDefaults } from "../src/config/publishedModelPricing.js";
import {
  computeUsageDelta,
  mergeSnapshots,
  UsageLedger,
  usageRowDedupeKey,
} from "../src/http/usageLedger.js";

describe("estimateUsd", () => {
  test("computes from per-million rates", () => {
    const pricing = {
      "gpt-4o": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10 },
    };
    expect(estimateUsd("gpt-4o", 1_000_000, 500_000, pricing, null)).toBeCloseTo(7.5, 5);
  });

  test("uses default model when name unknown", () => {
    const pricing = {
      "gpt-4o": { inputPerMillionUsd: 1, outputPerMillionUsd: 2 },
    };
    expect(estimateUsd("other", 1_000_000, 0, pricing, "gpt-4o")).toBeCloseTo(1, 5);
  });

  test("maps versioned OpenAI ids to published table via prefix", () => {
    const p = publishedModelPricingDefaults();
    expect(resolveModelKey("gpt-4o-2024-08-06", p, "gpt-4o")).toBe("gpt-4o");
    expect(estimateUsd("gpt-4o-2024-08-06", 1_000_000, 1_000_000, p, "gpt-4o")).toBeCloseTo(12.5, 5);
  });

  test("published defaults include OpenAI and Claude list prices", () => {
    const p = publishedModelPricingDefaults();
    expect(p["gpt-4o"]?.outputPerMillionUsd).toBe(10);
    expect(p["claude-3-5-sonnet"]?.outputPerMillionUsd).toBe(15);
  });

  test("returns 0 when no pricing band resolves", () => {
    expect(estimateUsd("x", 1000, 1000, {}, null)).toBe(0);
  });
});

describe("computeUsageDelta", () => {
  test("returns token deltas from cumulative snapshots", () => {
    const prev = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsd: null,
    };
    const d = computeUsageDelta(prev, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
    expect(d).toEqual({
      inputDelta: 2,
      outputDelta: 3,
      totalDelta: 5,
      costUsdDelta: null,
    });
  });

  test("returns null when nothing increases", () => {
    const prev = { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUsd: null };
    expect(computeUsageDelta(prev, { inputTokens: 5, outputTokens: 5, totalTokens: 10 })).toBeNull();
  });
});

describe("mergeSnapshots", () => {
  test("updates input and recomputes total from in+out when total omitted", () => {
    const prev = { inputTokens: 3, outputTokens: 4, totalTokens: 7, costUsd: 0.1 };
    const next = mergeSnapshots(prev, { inputTokens: 5 });
    expect(next.inputTokens).toBe(5);
    expect(next.outputTokens).toBe(4);
    expect(next.totalTokens).toBe(9);
  });
});

describe("usageRowDedupeKey", () => {
  test("is stable for same inputs", () => {
    const a = usageRowDedupeKey({
      threadId: "t1",
      turnId: "u1",
      inputDelta: 1,
      outputDelta: 2,
      totalDelta: 3,
      costUsdReportedDelta: null,
    });
    const b = usageRowDedupeKey({
      threadId: "t1",
      turnId: "u1",
      inputDelta: 1,
      outputDelta: 2,
      totalDelta: 3,
      costUsdReportedDelta: null,
    });
    expect(a).toBe(b);
    expect(a.length).toBe(24);
  });
});

describe("UsageLedger", () => {
  test("appends and reads JSONL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stark-ledger-"));
    const path = join(dir, "usage.jsonl");
    try {
      const ledger = new UsageLedger(path);
      await ledger.append({
        threadId: "th-1",
        turnId: null,
        conversationTitle: "Test",
        model: "gpt-4o",
        inputDelta: 1,
        outputDelta: 2,
        totalDelta: 3,
        costUsdReportedDelta: null,
      });
      const rows = await ledger.readAll();
      expect(rows.length).toBe(1);
      expect(rows[0].threadId).toBe("th-1");
      expect(rows[0].model).toBe("gpt-4o");
      const raw = await readFile(path, "utf8");
      expect(raw.trim().split("\n").length).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
