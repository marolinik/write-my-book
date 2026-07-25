import { describe, it, expect } from "vitest";
import { buildModelGroups } from "@/components/settings/model-picker-groups";

/**
 * D-131 — the picker dedupes same-displayName tier variants (keep highest
 * tier), so a stored non-kept id (Sam's seeded `openrouter-qwen36/sonnet`)
 * had NO SelectItem and Radix rendered a blank trigger: the writer could not
 * see their own default model.
 *
 * Fix: the dedupe must keep the family entry matching the currently selected
 * id, falling back to the highest tier when the selection is elsewhere.
 * Registry fact this pins: all three `openrouter-qwen36/*` tier ids share the
 * displayName "Qwen 3.6 27B (OpenRouter)".
 */
const QWEN_NAME = "Qwen 3.6 27B (OpenRouter)";

function openrouterModels(
  groups: ReturnType<typeof buildModelGroups>
): { id: string; displayName: string }[] {
  return (groups.get("openrouter") ?? []).map((m) => ({
    id: m.id,
    displayName: m.displayName,
  }));
}

describe("buildModelGroups — D-131 selected id survives displayName dedupe", () => {
  it("keeps the stored sonnet-tier id when it is the selection", () => {
    const models = openrouterModels(
      buildModelGroups(["openrouter"], "openrouter-qwen36/sonnet")
    );
    const qwen = models.filter((m) => m.displayName === QWEN_NAME);
    expect(qwen).toHaveLength(1);
    expect(qwen[0].id).toBe("openrouter-qwen36/sonnet");
  });

  it("keeps the highest tier when nothing from the family is selected (existing behavior pinned)", () => {
    for (const selectedId of [undefined, null, "some-other/model"]) {
      const models = openrouterModels(
        buildModelGroups(["openrouter"], selectedId)
      );
      const qwen = models.filter((m) => m.displayName === QWEN_NAME);
      expect(qwen).toHaveLength(1);
      expect(qwen[0].id).toBe("openrouter-qwen36/opus");
    }
  });

  it("swaps the family entry in place — list length and order unchanged", () => {
    const base = openrouterModels(buildModelGroups(["openrouter"]));
    const withSelection = openrouterModels(
      buildModelGroups(["openrouter"], "openrouter-qwen36/haiku")
    );
    expect(withSelection.map((m) => m.displayName)).toEqual(
      base.map((m) => m.displayName)
    );
    const idx = withSelection.findIndex((m) => m.displayName === QWEN_NAME);
    expect(withSelection[idx].id).toBe("openrouter-qwen36/haiku");
  });

  it("a selection in one provider does not disturb other providers' groups", () => {
    const groups = buildModelGroups(
      ["openrouter", "anthropic"],
      "openrouter-qwen36/sonnet"
    );
    const anthropic = groups.get("anthropic") ?? [];
    expect(anthropic.length).toBeGreaterThan(0);
    const openrouter = openrouterModels(groups);
    expect(
      openrouter.filter((m) => m.displayName === QWEN_NAME)[0].id
    ).toBe("openrouter-qwen36/sonnet");
  });
});
