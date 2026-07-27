// tests/unit/usage-aggregation.test.ts
// D-44 (P6 Owen, S3): the per-key usage panel aggregated spend with a
// `model.startsWith(`${provider}/`)` match. UsageRecord.model stores the
// registry ID (e.g. "openrouter-qwen36/sonnet"), whose provider is
// "openrouter" — but that id starts with "openrouter-", NOT "openrouter/",
// so every OpenRouter sub-variant (qwen36, minimax, kimi, glm, deepseek,
// qwen-max) missed the match and reported $0 while real spend accrued.
// These tests pin the registry-based provider attribution that replaces the
// prefix match, using realistic model-string fixtures.
import { describe, it, expect } from "vitest";
import {
  providerForUsageModel,
  aggregateUsageByProvider,
  formatUsageModelLabel,
  foldUsageModelsForDisplay,
  type UsageModelGroup,
} from "@/lib/llm/usage-aggregation";

describe("providerForUsageModel — registry-based attribution (D-44)", () => {
  it("attributes an OpenRouter sub-variant id to 'openrouter' (the missed case)", () => {
    // The exact id from the strong-setup.json evidence.
    expect(providerForUsageModel("openrouter-qwen36/sonnet")).toBe("openrouter");
  });

  it("attributes every OpenRouter variant family to 'openrouter'", () => {
    for (const id of [
      "openrouter/opus",
      "openrouter-minimax/haiku",
      "openrouter-qwen/opus",
      "openrouter-qwen36/haiku",
      "openrouter-qwen-max/sonnet",
      "openrouter-kimi/opus",
      "openrouter-glm/sonnet",
      "openrouter-deepseek/haiku",
    ]) {
      expect(providerForUsageModel(id)).toBe("openrouter");
    }
  });

  it("attributes direct-provider ids to their provider", () => {
    expect(providerForUsageModel("anthropic/opus")).toBe("anthropic");
    expect(providerForUsageModel("openai/gpt-4o")).toBe("openai");
    expect(providerForUsageModel("gemini/2.5-pro")).toBe("gemini");
    expect(providerForUsageModel("grok/grok-4")).toBe("grok");
  });

  it("returns null for models with no registry entry (embedding = platform cost, not a BYOK key)", () => {
    expect(providerForUsageModel("text-embedding-3-small")).toBeNull();
    expect(providerForUsageModel("totally-made-up/model")).toBeNull();
    expect(providerForUsageModel("")).toBeNull();
  });
});

describe("aggregateUsageByProvider — per-provider rollup (D-44)", () => {
  it("regression: a lone OpenRouter sub-variant produces non-zero openrouter spend", () => {
    // Pre-fix this exact input reported $0 for the openrouter key.
    const groups: UsageModelGroup[] = [
      {
        model: "openrouter-qwen36/sonnet",
        tokensInput: 900_000,
        tokensOutput: 300_000,
        costEstimate: 10.21,
        sessionCount: 7,
      },
    ];
    const totals = aggregateUsageByProvider(groups);
    expect(totals.get("openrouter")).toEqual({
      totalTokens: 1_200_000,
      totalCost: 10.21,
      sessionCount: 7,
    });
  });

  it("sums base + sub-variant rows under a single 'openrouter' bucket", () => {
    const groups: UsageModelGroup[] = [
      {
        model: "openrouter/opus",
        tokensInput: 100,
        tokensOutput: 50,
        costEstimate: 1.0,
        sessionCount: 1,
      },
      {
        model: "openrouter-qwen36/sonnet",
        tokensInput: 200,
        tokensOutput: 100,
        costEstimate: 2.0,
        sessionCount: 2,
      },
      {
        model: "openrouter-minimax/haiku",
        tokensInput: 400,
        tokensOutput: 0,
        costEstimate: 0.5,
        sessionCount: 3,
      },
    ];
    const totals = aggregateUsageByProvider(groups);
    expect(totals.get("openrouter")).toEqual({
      totalTokens: 850, // 150 + 300 + 400
      totalCost: 3.5,
      sessionCount: 6,
    });
  });

  it("keeps distinct providers in separate buckets", () => {
    const groups: UsageModelGroup[] = [
      {
        model: "anthropic/opus",
        tokensInput: 1000,
        tokensOutput: 500,
        costEstimate: 5.0,
        sessionCount: 4,
      },
      {
        model: "openrouter-qwen36/sonnet",
        tokensInput: 200,
        tokensOutput: 100,
        costEstimate: 2.0,
        sessionCount: 2,
      },
    ];
    const totals = aggregateUsageByProvider(groups);
    expect(totals.get("anthropic")).toEqual({
      totalTokens: 1500,
      totalCost: 5.0,
      sessionCount: 4,
    });
    expect(totals.get("openrouter")).toEqual({
      totalTokens: 300,
      totalCost: 2.0,
      sessionCount: 2,
    });
  });

  it("excludes rows whose model has no known provider (e.g. embeddings)", () => {
    const groups: UsageModelGroup[] = [
      {
        model: "text-embedding-3-small",
        tokensInput: 1_000_000,
        tokensOutput: 0,
        costEstimate: 0.02,
        sessionCount: 10,
      },
      {
        model: "anthropic/haiku",
        tokensInput: 100,
        tokensOutput: 100,
        costEstimate: 0.25,
        sessionCount: 1,
      },
    ];
    const totals = aggregateUsageByProvider(groups);
    expect([...totals.keys()]).toEqual(["anthropic"]);
    expect(totals.get("anthropic")).toEqual({
      totalTokens: 200,
      totalCost: 0.25,
      sessionCount: 1,
    });
  });

  it("does not mutate the input array", () => {
    const groups: UsageModelGroup[] = [
      {
        model: "anthropic/opus",
        tokensInput: 1,
        tokensOutput: 1,
        costEstimate: 1,
        sessionCount: 1,
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(groups));
    aggregateUsageByProvider(groups);
    expect(groups).toEqual(snapshot);
  });

  it("returns an empty map for no usage rows", () => {
    expect(aggregateUsageByProvider([]).size).toBe(0);
  });
});

describe("formatUsageModelLabel (D-119)", () => {
  it("renders a recognizable name + real API modelId for a registry slot id", () => {
    // D-119: the spend audit showed raw registry slot ids ("openrouter-qwen36/
    // haiku") — names the user never picked. Display them as the model the user
    // recognizes plus the exact API model string, while storage keeps the id.
    expect(formatUsageModelLabel("openrouter-qwen36/haiku")).toBe(
      "Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)"
    );
    expect(formatUsageModelLabel("anthropic/haiku")).toBe(
      "Claude Haiku 4.5 (Direct) (claude-haiku-4-5-20251001)"
    );
  });

  it("passes an unknown / legacy id through unchanged", () => {
    // Embedding + any legacy id has no registry entry — never mangle it.
    expect(formatUsageModelLabel("text-embedding-3-small")).toBe("text-embedding-3-small");
    expect(formatUsageModelLabel("totally-made-up/model")).toBe("totally-made-up/model");
    expect(formatUsageModelLabel("")).toBe("");
  });

  it("is display-only: labeling rows does not change provider rollup totals", () => {
    // The D-119 fix is read/display-level; the D-44 provider attribution must be
    // byte-for-byte unchanged whether or not the label is computed.
    const groups: UsageModelGroup[] = [
      {
        model: "openrouter-qwen36/sonnet",
        tokensInput: 900_000,
        tokensOutput: 300_000,
        costEstimate: 10.21,
        sessionCount: 7,
      },
      {
        model: "text-embedding-3-small",
        tokensInput: 1000,
        tokensOutput: 0,
        costEstimate: 0.02,
        sessionCount: 5,
      },
    ];

    const before = aggregateUsageByProvider(groups);
    // Compute labels (the display step) — must have zero effect on aggregation.
    groups.forEach((g) => formatUsageModelLabel(g.model));
    const after = aggregateUsageByProvider(groups);

    expect(after).toEqual(before);
    expect(after.get("openrouter")).toEqual({
      totalTokens: 1_200_000,
      totalCost: 10.21,
      sessionCount: 7,
    });
    // The embedding row has no BYOK provider and stays out of the rollup.
    expect(after.size).toBe(1);
  });
});

// ── D-175 ────────────────────────────────────────────────────────────────────
// "Usage by Model" listed the SAME model twice, indistinguishably: the rollup
// keys on the registry id (`openrouter-qwen36/haiku` vs
// `openrouter-qwen36/sonnet`) but renders only `displayName (modelId)`, which is
// identical for slots aliasing one provider model. A writer auditing spend saw
// "Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)" twice with different numbers
// and could not tell which was which.
describe("foldUsageModelsForDisplay (D-175)", () => {
  const QWEN_SLOTS: UsageModelGroup[] = [
    {
      model: "openrouter-qwen36/haiku",
      tokensInput: 6_000,
      tokensOutput: 3_700,
      costEstimate: 0.02,
      sessionCount: 3,
    },
    {
      model: "openrouter-qwen36/sonnet",
      tokensInput: 700_000,
      tokensOutput: 121_400,
      costEstimate: 0.43,
      sessionCount: 12,
    },
  ];

  it("renders ONE row for slots that alias the same provider model", () => {
    const rows = foldUsageModelsForDisplay(QWEN_SLOTS);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)");
  });

  it("sums the folded slots' tokens and cost — the answer to 'what did this model cost me?'", () => {
    const [row] = foldUsageModelsForDisplay(QWEN_SLOTS);
    expect(row.tokensInput).toBe(706_000);
    expect(row.tokensOutput).toBe(125_100);
    expect(row.costEstimate).toBeCloseTo(0.45, 10);
    expect(row.sessionCount).toBe(15);
  });

  it("discloses the registry slots behind a folded row, sorted", () => {
    // Auditability: the row is a fold, and the panel says so instead of
    // silently merging two lines the writer previously saw separately.
    const [row] = foldUsageModelsForDisplay(QWEN_SLOTS);
    expect(row.modelIds).toEqual([
      "openrouter-qwen36/haiku",
      "openrouter-qwen36/sonnet",
    ]);
  });

  it("leaves genuinely different models as separate rows", () => {
    const rows = foldUsageModelsForDisplay([
      ...QWEN_SLOTS,
      {
        model: "anthropic/opus",
        tokensInput: 600_000,
        tokensOutput: 86_800,
        costEstimate: 12.03,
        sessionCount: 9,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.modelIds.length)).toEqual([1, 2]);
    expect(rows.every((r) => r.label.length > 0)).toBe(true);
  });

  it("orders rows by spend, biggest first (stable on ties)", () => {
    const rows = foldUsageModelsForDisplay([
      {
        model: "openrouter-qwen36/haiku",
        tokensInput: 10,
        tokensOutput: 10,
        costEstimate: 0.01,
        sessionCount: 1,
      },
      {
        model: "anthropic/opus",
        tokensInput: 10,
        tokensOutput: 10,
        costEstimate: 12.03,
        sessionCount: 1,
      },
      {
        model: "anthropic/haiku",
        tokensInput: 10,
        tokensOutput: 10,
        costEstimate: 0.01,
        sessionCount: 1,
      },
    ]);
    expect(rows[0].modelIds).toEqual(["anthropic/opus"]);
    // Equal cost → deterministic label order, never render-order roulette.
    expect(rows.slice(1).map((r) => r.label)).toEqual([
      "Claude Haiku 4.5 (Direct) (claude-haiku-4-5-20251001)",
      "Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)",
    ]);
  });

  it("passes unknown / legacy ids through as their own row", () => {
    const rows = foldUsageModelsForDisplay([
      {
        model: "text-embedding-3-small",
        tokensInput: 1_000,
        tokensOutput: 0,
        costEstimate: 0.02,
        sessionCount: 5,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("text-embedding-3-small");
    expect(rows[0].modelIds).toEqual(["text-embedding-3-small"]);
  });

  it("tolerates rows with no session count (the /api/usage byModel shape)", () => {
    const rows = foldUsageModelsForDisplay([
      {
        model: "openrouter-qwen36/haiku",
        tokensInput: 5,
        tokensOutput: 5,
        costEstimate: 0.01,
      },
    ]);
    expect(rows[0].sessionCount).toBe(0);
  });

  it("is pure — no input mutation, empty in / empty out", () => {
    const snapshot = JSON.parse(JSON.stringify(QWEN_SLOTS));
    foldUsageModelsForDisplay(QWEN_SLOTS);
    expect(QWEN_SLOTS).toEqual(snapshot);
    expect(foldUsageModelsForDisplay([])).toEqual([]);
  });
});
