/**
 * Per-provider usage rollup for the BYOK settings panel.
 *
 * D-44: the panel aggregated spend with `model.startsWith(`${provider}/`)`.
 * UsageRecord.model stores the registry ID (e.g. "openrouter-qwen36/sonnet"),
 * whose provider is "openrouter" — but that id starts with "openrouter-", not
 * "openrouter/", so every OpenRouter sub-variant (qwen36, minimax, kimi, glm,
 * deepseek, qwen-max) fell out of the match and reported $0 while real spend
 * accrued. Attributing each model to its provider through the registry fixes
 * the mismatch for all current and future variants.
 */

import { getModelDef, type LLMProvider } from "@/lib/llm/model-registry";

/** Provider slug key used by the returned rollup map (an {@link LLMProvider}). */
export type UsageProviderKey = LLMProvider;

/** One `groupBy({ by: ["model"] })` row's totals for a single stored model id. */
export interface UsageModelGroup {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costEstimate: number;
  sessionCount: number;
}

/** Rolled-up totals for one provider. */
export interface ProviderUsageTotals {
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
}

/**
 * Resolve the provider a recorded `UsageRecord.model` string belongs to, via
 * the model registry. Returns null when the string has no registry entry —
 * e.g. the raw "text-embedding-3-small" embedding model, which is a platform
 * cost not tied to any BYOK provider key and so should not appear per-key.
 */
export function providerForUsageModel(model: string): LLMProvider | null {
  return getModelDef(model)?.provider ?? null;
}

/**
 * Fold per-model usage rows into per-provider totals, attributing each row to
 * its provider through {@link providerForUsageModel}. Rows with no known
 * provider are skipped. Pure and immutable — the input is never mutated.
 */
export function aggregateUsageByProvider(
  groups: readonly UsageModelGroup[]
): Map<string, ProviderUsageTotals> {
  const totals = new Map<string, ProviderUsageTotals>();

  for (const group of groups) {
    const provider = providerForUsageModel(group.model);
    if (!provider) continue;

    const prev = totals.get(provider) ?? {
      totalTokens: 0,
      totalCost: 0,
      sessionCount: 0,
    };

    totals.set(provider, {
      totalTokens: prev.totalTokens + group.tokensInput + group.tokensOutput,
      totalCost: prev.totalCost + group.costEstimate,
      sessionCount: prev.sessionCount + group.sessionCount,
    });
  }

  return totals;
}
