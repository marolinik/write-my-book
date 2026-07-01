import { describe, it, expect } from "vitest";
import {
  MODEL_REGISTRY,
  resolveFromTier,
  resolveCheapModelFor,
  getModelTierValue,
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

describe("getModelTierValue", () => {
  it("orders haiku < sonnet < opus", () => {
    expect(getModelTierValue("haiku")).toBeLessThan(getModelTierValue("sonnet"));
    expect(getModelTierValue("sonnet")).toBeLessThan(getModelTierValue("opus"));
  });
});
