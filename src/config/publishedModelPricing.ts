import type { ModelPricingBand } from "../types.js";

/**
 * Default $/1M-token estimates for webchat billing when you do not override rates in config/env.
 *
 * Sources (standard / non-batch API tiers, base input + output only; prompt-cache tiers omitted):
 * - OpenAI — https://platform.openai.com/docs/pricing (Flagship models, “Standard”), 2026-05
 * - Anthropic — https://docs.anthropic.com/en/docs/about-claude/pricing (Base input + Output), 2026-05
 *
 * Vendor prices change: override via `webchat.model_pricing`, `STARK_WEBCHAT_MODEL_PRICING_FILE`,
 * or `STARK_WEBCHAT_MODEL_PRICING_JSON` after merges applied on top of this table.
 */
export function publishedModelPricingDefaults(): Record<string, ModelPricingBand> {
  return { ...PUBLISHED_MODEL_PRICING };
}

const b = (inputPerMillionUsd: number, outputPerMillionUsd: number): ModelPricingBand => ({
  inputPerMillionUsd,
  outputPerMillionUsd,
});

/** Frozen published list; copied on each `publishedModelPricingDefaults()` call so merges never mutate it. */
const PUBLISHED_MODEL_PRICING: Record<string, ModelPricingBand> = {
  // —— OpenAI (standard) ——
  "gpt-5.5": b(5, 30),
  "gpt-5.5-pro": b(30, 180),
  "gpt-5.4": b(2.5, 15),
  "gpt-5.4-mini": b(0.75, 4.5),
  "gpt-5.4-nano": b(0.2, 1.25),
  "gpt-5.4-pro": b(30, 180),
  "gpt-5.2": b(1.75, 14),
  "gpt-5.2-pro": b(21, 168),
  "gpt-5.1": b(1.25, 10),
  "gpt-5": b(1.25, 10),
  "gpt-5-mini": b(0.25, 2),
  "gpt-5-nano": b(0.05, 0.4),
  "gpt-5-pro": b(15, 120),
  "gpt-4.1": b(2, 8),
  "gpt-4.1-mini": b(0.4, 1.6),
  "gpt-4.1-nano": b(0.1, 0.4),
  "gpt-4o": b(2.5, 10),
  "gpt-4o-2024-05-13": b(5, 15),
  "gpt-4o-mini": b(0.15, 0.6),
  o1: b(15, 60),
  "o1-pro": b(150, 600),
  "o1-mini": b(1.1, 4.4),
  o3: b(2, 8),
  "o3-pro": b(20, 80),
  "o3-mini": b(1.1, 4.4),
  "o4-mini": b(1.1, 4.4),
  "gpt-4-turbo-2024-04-09": b(10, 30),
  "gpt-4-0125-preview": b(10, 30),
  "gpt-4-1106-preview": b(10, 30),
  "gpt-4-1106-vision-preview": b(10, 30),
  "gpt-4-0613": b(30, 60),
  "gpt-4-0314": b(30, 60),
  "gpt-4-32k": b(60, 120),
  "gpt-3.5-turbo": b(0.5, 1.5),
  "gpt-3.5-turbo-0125": b(0.5, 1.5),
  "gpt-3.5-turbo-1106": b(1, 2),
  "gpt-3.5-turbo-0613": b(1.5, 2),
  "gpt-3.5-0301": b(1.5, 2),
  "gpt-3.5-turbo-instruct": b(1.5, 2),
  "gpt-3.5-turbo-16k-0613": b(3, 4),
  "davinci-002": b(2, 2),
  "babbage-002": b(0.4, 0.4),
  "text-embedding-3-small": b(0.02, 0),
  "text-embedding-3-large": b(0.13, 0),
  "text-embedding-ada-002": b(0.1, 0),
  "o3-deep-research": b(10, 40),
  "o4-mini-deep-research": b(2, 8),
  "computer-use-preview": b(3, 12),

  // —— Anthropic (first-party API, base input + output) ——
  "claude-opus-4-7": b(5, 25),
  "claude-opus-4-6": b(5, 25),
  "claude-opus-4-5": b(5, 25),
  "claude-opus-4-1": b(15, 75),
  "claude-opus-4-20250514": b(15, 75),
  "claude-opus-4": b(15, 75),
  "claude-sonnet-4-6": b(3, 15),
  "claude-sonnet-4-5": b(3, 15),
  "claude-sonnet-4-20250514": b(3, 15),
  "claude-sonnet-4": b(3, 15),
  "claude-3-7-sonnet-20250219": b(3, 15),
  "claude-3-5-sonnet-20241022": b(3, 15),
  "claude-3-5-sonnet-20240620": b(3, 15),
  "claude-3-5-sonnet": b(3, 15),
  "claude-haiku-4-5": b(1, 5),
  "claude-3-5-haiku-20241022": b(0.8, 4),
  "claude-3-haiku-20240307": b(0.25, 1.25),
};
