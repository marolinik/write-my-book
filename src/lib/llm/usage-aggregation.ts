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
 * Render a recorded `UsageRecord.model` registry id as a label the writer
 * recognizes — the model's display name plus the real API model string, e.g.
 * "Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)" for the stored slot id
 * "openrouter-qwen36/haiku" (D-119). Storage is untouched — the id remains the
 * D-44 provider-attribution contract; this is a read/display transform only.
 * Unknown / legacy ids (e.g. the raw "text-embedding-3-small" embedding model)
 * pass through verbatim rather than being mangled.
 */
export function formatUsageModelLabel(model: string): string {
  const def = getModelDef(model);
  if (!def) return model;
  return `${def.displayName} (${def.modelId})`;
}

/**
 * A `groupBy`/reduce row as the usage API actually returns it for `byModel` —
 * `sessionCount` is absent there (the route counts sessions only per agent), so
 * it is optional here rather than forcing callers to invent a zero.
 */
export type UsageModelTotals = Omit<UsageModelGroup, "sessionCount"> & {
  sessionCount?: number;
};

/** One "Usage by Model" line, after aliasing slots have been folded together. */
export interface UsageModelDisplayRow {
  /** Writer-facing label: display name + real API model id. */
  label: string;
  /**
   * The registry ids folded into this row, sorted. More than one means several
   * configured slots resolve to the same provider model — the panel discloses
   * them so a folded row stays auditable.
   */
  modelIds: string[];
  tokensInput: number;
  tokensOutput: number;
  costEstimate: number;
  sessionCount: number;
}

/**
 * Fold per-model usage rows into the rows the "Usage by Model" panel renders
 * (D-175).
 *
 * The rollup keys on the stored registry id — the D-44 provider-attribution
 * contract — but several slots can alias ONE provider model
 * (`openrouter-qwen36/haiku` and `openrouter-qwen36/sonnet` are both
 * `qwen/qwen3.6-27b`). Rendered through {@link formatUsageModelLabel} those
 * produced two rows with an identical name and identical model id but different
 * numbers, so "how much did this model cost me?" had two contradictory answers
 * and no way to tell them apart.
 *
 * Rows are therefore keyed by the rendered label — the finest distinction the
 * panel actually shows — summed, and tagged with the registry ids they came
 * from. Unknown/legacy ids (e.g. "text-embedding-3-small") pass through as their
 * own row, exactly as `formatUsageModelLabel` passes them through verbatim.
 *
 * Sorted by spend (biggest first), tie-broken by label so the order is
 * deterministic. Pure and immutable — the input is never mutated.
 */
export function foldUsageModelsForDisplay(
  groups: readonly UsageModelTotals[]
): UsageModelDisplayRow[] {
  const byLabel = new Map<string, UsageModelDisplayRow>();

  for (const group of groups) {
    const label = formatUsageModelLabel(group.model);
    const prev = byLabel.get(label);
    const modelIds = prev?.modelIds.includes(group.model)
      ? prev.modelIds
      : [...(prev?.modelIds ?? []), group.model];

    byLabel.set(label, {
      label,
      modelIds,
      tokensInput: (prev?.tokensInput ?? 0) + group.tokensInput,
      tokensOutput: (prev?.tokensOutput ?? 0) + group.tokensOutput,
      costEstimate: (prev?.costEstimate ?? 0) + group.costEstimate,
      sessionCount: (prev?.sessionCount ?? 0) + (group.sessionCount ?? 0),
    });
  }

  return [...byLabel.values()]
    .map((row) => ({ ...row, modelIds: [...row.modelIds].sort() }))
    .sort(
      (a, b) => b.costEstimate - a.costEstimate || a.label.localeCompare(b.label)
    );
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
