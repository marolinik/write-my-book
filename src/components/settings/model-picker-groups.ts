/**
 * D-131 — grouping/dedupe for the model picker, extracted from
 * model-picker.tsx. Same-displayName tier variants (e.g. all three
 * `openrouter-qwen36/*` ids) collapse to one SelectItem; keeping only the
 * highest tier left a stored lower-tier id with NO item, so Radix rendered a
 * blank trigger and the writer couldn't see their own default. The dedupe now
 * keeps the family entry matching `selectedId`, falling back to highest tier.
 */
import {
  getModelsForProviders,
  getModelTierValue,
  type ProviderKey,
  type ModelDefinition,
} from "@/lib/llm";

export function buildModelGroups(
  availableProviders: ProviderKey[],
  selectedId?: string | null,
  /** Custom-provider MCP vendors carrying their own defs (local proxy boxes, private hubs). */
  customModels?: ModelDefinition[]
): Map<ProviderKey, ModelDefinition[]> {
  let models = getModelsForProviders(availableProviders);
  if (customModels && customModels.length > 0) {
    models = [...models, ...customModels];
  }
  const groups = new Map<ProviderKey, ModelDefinition[]>();

  for (const model of models) {
    const key = model.provider as ProviderKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(model);
  }

  for (const [, modelList] of groups) {
    modelList.sort(
      (a, b) => getModelTierValue(b.tier) - getModelTierValue(a.tier)
    );
  }

  for (const [key, modelList] of groups) {
    const byName = new Map<string, ModelDefinition[]>();
    for (const m of modelList) {
      if (!byName.has(m.displayName)) byName.set(m.displayName, []);
      byName.get(m.displayName)!.push(m);
    }

    const emitted = new Set<string>();
    const deduped: ModelDefinition[] = [];
    for (const m of modelList) {
      if (emitted.has(m.displayName)) continue;
      emitted.add(m.displayName);
      const family = byName.get(m.displayName)!;
      const selected = selectedId
        ? family.find((f) => f.id === selectedId)
        : undefined;
      // Keep the selected id's entry at the family's first position;
      // otherwise the first entry (highest tier — list is pre-sorted).
      deduped.push(selected ?? m);
    }
    groups.set(key, deduped);
  }

  return groups;
}
