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
