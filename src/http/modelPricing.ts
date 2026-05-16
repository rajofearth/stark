import type { ModelPricingBand } from "../types.js";

export function estimateUsd(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
  pricing: Record<string, ModelPricingBand>,
  defaultModel: string | null,
): number {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return 0;
  if (inputTokens <= 0 && outputTokens <= 0) return 0;
  const key = resolveModelKey(model, pricing, defaultModel);
  const band = pricing[key];
  if (!band) return 0;
  return (inputTokens / 1_000_000) * band.inputPerMillionUsd + (outputTokens / 1_000_000) * band.outputPerMillionUsd;
}

/** Resolve a pricing table key from a runtime model id (versioned ids, casing). Exported for tests. */
export function resolveModelKey(
  model: string | null | undefined,
  pricing: Record<string, ModelPricingBand>,
  defaultModel: string | null,
): string {
  const keys = Object.keys(pricing);
  if (keys.length === 0) return "";

  const preferred =
    (defaultModel && pricing[defaultModel] ? defaultModel : null) ||
    (keys.includes("gpt-4o") ? "gpt-4o" : null) ||
    keys[0] ||
    "";

  const raw = (model && model.trim()) || (defaultModel && defaultModel.trim()) || "";
  if (!raw) return preferred;

  if (pricing[raw]) return raw;
  const lower = raw.toLowerCase();
  for (const id of keys) {
    if (id.toLowerCase() === lower) return id;
  }

  const sorted = [...keys].sort((a, b) => b.length - a.length);
  for (const id of sorted) {
    const idl = id.toLowerCase();
    if (lower === idl || lower.startsWith(`${idl}-`)) return id;
  }

  return preferred;
}
