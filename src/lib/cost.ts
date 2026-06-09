import { getModelDef, resolveFromTier } from "@/lib/llm";

/**
 * Estimate cost based on model and token usage (USD).
 * Accepts registry IDs ("anthropic/sonnet", "openrouter/haiku") or
 * legacy tier strings ("opus", "sonnet", "haiku") for backward compat.
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Try exact registry lookup first, then legacy tier resolution
  const def = getModelDef(model) ?? resolveFromTier(model);
  return (
    (inputTokens * def.inputCostPer1M) / 1_000_000 +
    (outputTokens * def.outputCostPer1M) / 1_000_000
  );
}

/**
 * Rough cost estimate for cross-book series operations.
 * Based on typical token usage per chapter with Sonnet.
 */
export function estimateSeriesCost(
  bookCount: number,
  avgChaptersPerBook: number = 15
): number {
  const totalChapters = bookCount * avgChaptersPerBook;
  const inputTokens = totalChapters * 8000;
  const outputTokens = totalChapters * 2000;
  return estimateCost("sonnet", inputTokens, outputTokens);
}
