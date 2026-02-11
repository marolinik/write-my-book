/** Estimate cost based on model tier and token usage (USD). */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Per-token costs (USD per 1M tokens) — Claude 4.x pricing
  const rates: Record<string, { input: number; output: number }> = {
    opus: { input: 15, output: 75 },
    sonnet: { input: 3, output: 15 },
    haiku: { input: 0.25, output: 1.25 },
  };
  const rate = rates[model] ?? rates.sonnet;
  return (
    (inputTokens * rate.input) / 1_000_000 +
    (outputTokens * rate.output) / 1_000_000
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
