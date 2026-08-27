import { describe, it, expect } from "vitest";
import {
  MODEL_REGISTRY,
  resolveFromTier,
  resolveCheapModelFor,
  resolveQuickAssistModelFor,
  getModelTierValue,
  getModelDef,
  clampMaxTokens,
  type ModelDefinition,
} from "@/lib/llm/model-registry";

describe("resolveFromTier", () => {
  it("maps legacy tier strings to the anthropic direct variant", () => {
    expect(resolveFromTier("opus").id).toBe("anthropic/opus");
    expect(resolveFromTier("sonnet").id).toBe("anthropic/sonnet");
    expect(resolveFromTier("haiku").id).toBe("anthropic/haiku");
  });

  it("falls back to anthropic/sonnet for an unknown tier", () => {
    expect(resolveFromTier("does-not-exist").id).toBe("anthropic/sonnet");
  });
});

describe("resolveCheapModelFor", () => {
  it("resolves the haiku variant by prefix for anthropic", () => {
    expect(resolveCheapModelFor("anthropic/opus").id).toBe("anthropic/haiku");
  });

  it("resolves an openai default to openai's OWN cheap model, not anthropic", () => {
    // Regression guard: string-building `${prefix}/haiku` misses for openai
    // (no "openai/haiku" id). The old code then silently fell back to
    // anthropic/sonnet — wrong cost AND a guaranteed key-missing failure for a
    // single-key openai user.
    const cheap = resolveCheapModelFor("openai/gpt-4o");
    expect(cheap.provider).toBe("openai");
    expect(cheap.id).toBe("openai/gpt-4o-mini");
  });

  it("resolves gemini and grok defaults to same-provider cheap models", () => {
    expect(resolveCheapModelFor("gemini/2.5-pro").provider).toBe("gemini");
    expect(resolveCheapModelFor("grok/grok-4").provider).toBe("grok");
  });

  it("INVARIANT: every registered model resolves to a same-provider haiku-tier model", () => {
    for (const model of MODEL_REGISTRY) {
      const cheap = resolveCheapModelFor(model.id);
      expect(cheap.tier, `cheap(${model.id}).tier`).toBe("haiku");
      expect(cheap.provider, `cheap(${model.id}).provider`).toBe(model.provider);
    }
  });

  it("falls back to anthropic/haiku for a completely unknown model id", () => {
    expect(resolveCheapModelFor("mystery/model").id).toBe("anthropic/haiku");
  });
});

describe("resolveQuickAssistModelFor (D-116/D-117)", () => {
  it("routes the seeded qwen36 reasoning default to the cheapest non-reasoning openrouter haiku (deepseek)", () => {
    // D-116/D-117: openrouter-qwen36/* aliases the qwen/qwen3.6-27b reasoning
    // model at every tier, so its own "/haiku" slot is STILL that reasoning
    // model — quick-assist must escape it. DeepSeek V3.2 is the cheapest
    // non-reasoning openrouter haiku (outputCost 0.4) and is capture-proven.
    for (const tier of ["opus", "sonnet", "haiku"] as const) {
      expect(resolveQuickAssistModelFor(`openrouter-qwen36/${tier}`).id).toBe(
        "openrouter-deepseek/haiku"
      );
    }
  });

  it("leaves a non-flagged candidate untouched (anthropic → anthropic/haiku)", () => {
    expect(resolveQuickAssistModelFor("anthropic/sonnet").id).toBe("anthropic/haiku");
  });

  it("leaves the non-flagged openrouter base variant untouched (openrouter → openrouter/haiku)", () => {
    expect(resolveQuickAssistModelFor("openrouter/sonnet").id).toBe("openrouter/haiku");
  });

  it("preserves same-provider attribution when it re-routes", () => {
    const resolved = resolveQuickAssistModelFor("openrouter-qwen36/sonnet");
    expect(resolved.provider).toBe("openrouter");
    expect(resolved.unfitForQuickAssist).toBeFalsy();
  });

  it("falls back to the flagged candidate when no same-provider alternative exists", () => {
    // Passthrough branch: inject a registry whose only openrouter haiku entries
    // are the flagged qwen36 ones, so the alternative search finds nothing and
    // the honest 422 net downstream stays the backstop. Real registry entries
    // only — no fabricated production models.
    const onlyUnfit = MODEL_REGISTRY.filter((m) => m.id.startsWith("openrouter-qwen36/"));
    expect(resolveQuickAssistModelFor("openrouter-qwen36/sonnet", onlyUnfit).id).toBe(
      "openrouter-qwen36/haiku"
    );
  });

  it("flags ONLY the observed-unfit qwen36 slots as unfit for quick assist", () => {
    // openrouter-qwen36/*: OBSERVED failure — thinking-only at tiny budgets
    // (D-116/D-117). (The ox-alpha provenness gate was removed with the model
    // itself when OpenRouter revoked it.)
    const flaggedPrefixes = ["openrouter-qwen36/"];
    for (const m of MODEL_REGISTRY) {
      const shouldBeFlagged = flaggedPrefixes.some((p) => m.id.startsWith(p));
      expect(Boolean(m.unfitForQuickAssist), `${m.id}.unfitForQuickAssist`).toBe(
        shouldBeFlagged
      );
    }
  });
});

describe("getModelTierValue", () => {
  it("orders haiku < sonnet < opus", () => {
    expect(getModelTierValue("haiku")).toBeLessThan(getModelTierValue("sonnet"));
    expect(getModelTierValue("sonnet")).toBeLessThan(getModelTierValue("opus"));
  });
});

describe("clampMaxTokens", () => {
  const withCap: ModelDefinition = {
    id: "test/capped",
    provider: "openrouter",
    modelId: "test/capped",
    displayName: "Capped",
    tier: "opus",
    inputCostPer1M: 1,
    outputCostPer1M: 1,
    costTier: "$",
    supportsTools: true,
    supportsStreaming: true,
    maxOutputTokens: 32768,
  };
  const noCap: ModelDefinition = { ...withCap, id: "test/uncapped", maxOutputTokens: undefined };

  it("clamps a request that exceeds the model's cap down to the cap", () => {
    expect(clampMaxTokens(64000, withCap)).toBe(32768);
  });

  it("leaves the request unchanged when no cap is present", () => {
    expect(clampMaxTokens(64000, noCap)).toBe(64000);
  });

  it("leaves the request unchanged when it is below the cap", () => {
    expect(clampMaxTokens(1000, withCap)).toBe(1000);
  });

  it("returns the cap when request equals the cap", () => {
    expect(clampMaxTokens(32768, withCap)).toBe(32768);
  });
});

describe("qwen-max output ceiling", () => {
  it("every openrouter-qwen-max entry declares the 32768 output cap", () => {
    for (const tier of ["opus", "sonnet", "haiku"] as const) {
      const def = getModelDef(`openrouter-qwen-max/${tier}`);
      expect(def, `openrouter-qwen-max/${tier} exists`).toBeDefined();
      expect(def!.maxOutputTokens, `openrouter-qwen-max/${tier} cap`).toBe(32768);
    }
  });

  it("clamps a 64000-token request for qwen-max down to 32768", () => {
    const def = getModelDef("openrouter-qwen-max/opus")!;
    expect(clampMaxTokens(64000, def)).toBe(32768);
  });
});
