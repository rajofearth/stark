import type { Response } from "express";
import type { ModelPricingBand, Settings } from "../types.js";
import { estimateUsd } from "./modelPricing.js";
import type { UsageLedger, UsageLedgerRecord } from "./usageLedger.js";

/** Parse `from` / `to` query params: YYYY-MM-DD (local server day bounds) or ISO instant. */
export function parseBillingRange(
  fromStr: string | undefined,
  toStr: string | undefined,
): { fromMs: number; toMs: number } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (!fromStr?.trim() && !toStr?.trim()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - 29);
    return { fromMs: start.getTime(), toMs: endOfToday };
  }

  let fromMs: number;
  let toMs: number;

  if (fromStr?.trim()) {
    fromMs = parseBoundaryStart(fromStr.trim());
  } else {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    s.setDate(s.getDate() - 29);
    fromMs = s.getTime();
  }

  if (toStr?.trim()) {
    toMs = parseBoundaryEnd(toStr.trim());
  } else {
    toMs = endOfToday;
  }

  if (fromMs > toMs) [fromMs, toMs] = [toMs, fromMs];
  return { fromMs, toMs };
}

function parseBoundaryStart(s: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y!, m! - 1, d!, 0, 0, 0, 0).getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Date.now();
}

function parseBoundaryEnd(s: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y!, m! - 1, d!, 23, 59, 59, 999).getTime();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : Date.now();
}

export function rowCosts(
  row: UsageLedgerRecord,
  pricing: Record<string, ModelPricingBand>,
  defaultModel: string,
): { reported: number; estimatedOnly: number } {
  const reported =
    typeof row.costUsdReportedDelta === "number" && row.costUsdReportedDelta > 0
      ? row.costUsdReportedDelta
      : 0;
  const est = estimateUsd(row.model, row.inputDelta, row.outputDelta, pricing, defaultModel);
  const estimatedOnly = reported > 0 ? 0 : est;
  return { reported, estimatedOnly };
}

function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface BillingSummaryJson {
  fromMs: number;
  toMs: number;
  totalTokens: number;
  totalReportedUsd: number;
  totalEstimatedUsd: number;
  /** Combined spend (reported + estimated-only rows) */
  totalSpendUsd: number;
  eventCount: number;
  /** Models with any usage in range (ignores model filter — for UI dropdown). */
  allModels: string[];
  byModel: { model: string; tokens: number; reportedUsd: number; estimatedUsd: number }[];
  daily: {
    day: string;
    tokens: number;
    reportedUsd: number;
    estimatedUsd: number;
    cumulativeReportedUsd: number;
    cumulativeEstimatedUsd: number;
    cumulativeTotalUsd: number;
  }[];
}

export function buildBillingSummary(
  rows: UsageLedgerRecord[],
  pricing: Record<string, ModelPricingBand>,
  defaultModel: string,
  fromMs: number,
  toMs: number,
  modelFilter: string | null = null,
): BillingSummaryJson {
  const inTime = rows.filter((row) => {
    const t = Date.parse(row.recordedAt);
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });
  const allModels = Array.from(new Set(inTime.map((r) => r.model).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
  const rowsIn = modelFilter ? inTime.filter((r) => r.model === modelFilter) : inTime;
  let totalTokens = 0;
  let totalReportedUsd = 0;
  let totalEstimatedUsd = 0;
  let eventCount = 0;
  const modelMap = new Map<string, { tokens: number; reportedUsd: number; estimatedUsd: number }>();
  const dayMap = new Map<
    string,
    { tokens: number; reportedUsd: number; estimatedUsd: number }
  >();

  for (const row of rowsIn) {
    const t = Date.parse(row.recordedAt);
    if (!Number.isFinite(t) || t < fromMs || t > toMs) continue;
    eventCount += 1;

    const { reported, estimatedOnly } = rowCosts(row, pricing, defaultModel);
    const tok = row.totalDelta > 0 ? row.totalDelta : row.inputDelta + row.outputDelta;

    totalTokens += tok;
    totalReportedUsd += reported;
    totalEstimatedUsd += estimatedOnly;

    const mkey = row.model || "(unknown)";
    const agg = modelMap.get(mkey) ?? { tokens: 0, reportedUsd: 0, estimatedUsd: 0 };
    agg.tokens += tok;
    agg.reportedUsd += reported;
    agg.estimatedUsd += estimatedOnly;
    modelMap.set(mkey, agg);

    const day = localDayKey(t);
    const dagg = dayMap.get(day) ?? { tokens: 0, reportedUsd: 0, estimatedUsd: 0 };
    dagg.tokens += tok;
    dagg.reportedUsd += reported;
    dagg.estimatedUsd += estimatedOnly;
    dayMap.set(day, dagg);
  }

  const sortedDays = Array.from(dayMap.keys()).sort();
  let cumR = 0;
  let cumE = 0;
  const daily = sortedDays.map((day) => {
    const d = dayMap.get(day)!;
    cumR += d.reportedUsd;
    cumE += d.estimatedUsd;
    return {
      day,
      tokens: d.tokens,
      reportedUsd: d.reportedUsd,
      estimatedUsd: d.estimatedUsd,
      cumulativeReportedUsd: cumR,
      cumulativeEstimatedUsd: cumE,
      cumulativeTotalUsd: cumR + cumE,
    };
  });

  const byModel = Array.from(modelMap.entries())
    .map(([model, v]) => ({
      model,
      tokens: v.tokens,
      reportedUsd: v.reportedUsd,
      estimatedUsd: v.estimatedUsd,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    fromMs,
    toMs,
    totalTokens,
    totalReportedUsd,
    totalEstimatedUsd,
    totalSpendUsd: totalReportedUsd + totalEstimatedUsd,
    eventCount,
    allModels,
    byModel,
    daily,
  };
}

export function ledgerEventToTableRow(
  row: UsageLedgerRecord,
  pricing: Record<string, ModelPricingBand>,
  defaultModel: string,
): Record<string, unknown> {
  const { reported, estimatedOnly } = rowCosts(row, pricing, defaultModel);
  const tokens = row.totalDelta > 0 ? row.totalDelta : row.inputDelta + row.outputDelta;
  const type =
    reported > 0 ? "reported" : estimatedOnly > 0 || tokens > 0 ? "estimated" : "—";
  return {
    id: row.id,
    recordedAt: row.recordedAt,
    threadId: row.threadId,
    model: row.model,
    description: row.conversationTitle || "Webchat usage",
    tokens,
    costUsdReported: reported > 0 ? reported : null,
    costUsdEstimated: estimatedOnly > 0 ? estimatedOnly : null,
    type,
  };
}

export async function sendBillingSummary(
  ledger: UsageLedger,
  settings: Settings,
  fromStr: string | undefined,
  toStr: string | undefined,
  modelFilter: string | null,
  response: Response,
): Promise<void> {
  const { fromMs, toMs } = parseBillingRange(fromStr, toStr);
  const rows = await ledger.readRange(fromMs, toMs);
  const summary = buildBillingSummary(
    rows,
    settings.webchat.modelPricing,
    settings.webchat.defaultModel,
    fromMs,
    toMs,
    modelFilter,
  );
  response.json(summary);
}

export async function sendBillingEvents(
  ledger: UsageLedger,
  settings: Settings,
  fromStr: string | undefined,
  toStr: string | undefined,
  pageStr: string | undefined,
  pageSizeStr: string | undefined,
  modelFilter: string | null,
  response: Response,
): Promise<void> {
  const { fromMs, toMs } = parseBillingRange(fromStr, toStr);
  const rows = await ledger.readRange(fromMs, toMs);
  let filtered = rows
    .filter((r) => {
      const t = Date.parse(r.recordedAt);
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    });
  if (modelFilter) filtered = filtered.filter((r) => r.model === modelFilter);
  filtered.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));

  const pageSize = Math.min(100, Math.max(1, Number(pageSizeStr) || 20));
  const page = Math.max(1, Number(pageStr) || 1);
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  response.json({
    page,
    pageSize,
    total: filtered.length,
    events: slice.map((r) => ledgerEventToTableRow(r, settings.webchat.modelPricing, settings.webchat.defaultModel)),
  });
}

export async function sendBillingCsv(
  ledger: UsageLedger,
  settings: Settings,
  fromStr: string | undefined,
  toStr: string | undefined,
  modelFilter: string | null,
  response: Response,
): Promise<void> {
  const { fromMs, toMs } = parseBillingRange(fromStr, toStr);
  const rows = await ledger.readRange(fromMs, toMs);
  let filtered = rows.filter((r) => {
    const t = Date.parse(r.recordedAt);
    return Number.isFinite(t) && t >= fromMs && t <= toMs;
  });
  if (modelFilter) filtered = filtered.filter((r) => r.model === modelFilter);
  filtered.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

  const cols = [
    "recorded_at",
    "thread_id",
    "model",
    "description",
    "input_delta",
    "output_delta",
    "total_delta",
    "cost_usd_reported_delta",
    "cost_usd_estimated",
    "type",
  ];
  const lines: string[] = [cols.join(",")];
  for (const row of filtered) {
    const trow = ledgerEventToTableRow(row, settings.webchat.modelPricing, settings.webchat.defaultModel);
    const vals = [
      row.recordedAt,
      row.threadId,
      row.model,
      String(trow.description ?? "").replaceAll('"', '""'),
      String(row.inputDelta),
      String(row.outputDelta),
      String(row.totalDelta > 0 ? row.totalDelta : row.inputDelta + row.outputDelta),
      row.costUsdReportedDelta === null ? "" : String(row.costUsdReportedDelta),
      trow.costUsdEstimated === null ? "" : String(trow.costUsdEstimated),
      String(trow.type ?? ""),
    ].map((v) => (/,|\n|"/.test(v) ? `"${v}"` : v));
    lines.push(vals.join(","));
  }

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="stark-billing.csv"');
  response.send(lines.join("\n"));
}
