/**
 * The platform default is DeepSeek V4.1 Flash on OpenRouter, and the fleet
 * stays a model you can add beside it.
 *
 * The built-in default used to be the self-hosted fleet. That works on a box
 * that HAS a fleet and on no other: a clean clone, or any hosted deployment,
 * defaulted to a gateway that is not there. The owner runs a fleet and is
 * keeping it — but as one of the models a writer can pick, not as the thing
 * every fresh install silently assumes.
 *
 * So the default moves to a model anyone with one OpenRouter key can reach,
 * chosen because it is very cheap ($0.15 / $0.60 per million) and has a
 * million tokens of context, which is what a manuscript needs.
 *
 * Two things this must not break:
 *  - **The fleet stays addable.** Its registry entries stay, at zero cost, and
 *    `WMB_LOCAL_FALLBACK=1` still catches a writer who has no key at all.
 *  - **The default must be fit for quick-assist.** A reasoning model as the
 *    platform default would send ghost-text and inline-edit around it on every
 *    single call (D-116/D-117), which is how the default stops being the
 *    default without anyone noticing.
 */

import { describe, it, expect } from "vitest";
import { getModelDef, resolveQuickAssistModelFor, resolveCheapModelFor } from "@/lib/llm/model-registry";
import { FALLBACK_DEFAULT_MODEL_ID } from "@/lib/llm/defaults";

const FAMILY = "openrouter-deepseek-flash";
const OPENROUTER_MODEL_ID = "deepseek/deepseek-v4.1-flash";

describe("the platform default", () => {
  it("is a model the registry actually has", () => {
    expect(getModelDef(FALLBACK_DEFAULT_MODEL_ID)).toBeDefined();
  });

  it("is DeepSeek V4.1 Flash served through OpenRouter", () => {
    const def = getModelDef(FALLBACK_DEFAULT_MODEL_ID)!;
    expect(def.provider).toBe("openrouter");
    expect(def.modelId).toBe(OPENROUTER_MODEL_ID);
  });

  it("exists at all three tiers, as every family in this registry does", () => {
    for (const tier of ["opus", "sonnet", "haiku"] as const) {
      const def = getModelDef(`${FAMILY}/${tier}`);
      expect(def, tier).toBeDefined();
      expect(def!.tier).toBe(tier);
      expect(def!.modelId).toBe(OPENROUTER_MODEL_ID);
    }
  });

  it("is priced as the provider prices it, not guessed", () => {
    const def = getModelDef(`${FAMILY}/sonnet`)!;
    expect(def.inputCostPer1M).toBeCloseTo(0.15, 5);
    expect(def.outputCostPer1M).toBeCloseTo(0.6, 5);
  });

  it("is fit for quick-assist, so ghost-text does not route around it", () => {
    const def = getModelDef(FALLBACK_DEFAULT_MODEL_ID)!;
    expect(def.unfitForQuickAssist).not.toBe(true);
    // The substitution must be a no-op for the default: if it moves, the
    // default is not really the default on the quick surfaces.
    expect(resolveQuickAssistModelFor(FALLBACK_DEFAULT_MODEL_ID).id).toBe(
      resolveCheapModelFor(FALLBACK_DEFAULT_MODEL_ID).id
    );
  });
});

describe("the self-hosted fleet", () => {
  it("is still a model a writer can add beside it", () => {
    for (const tier of ["opus", "sonnet", "haiku"] as const) {
      const def = getModelDef(`local-deepseek/${tier}`);
      expect(def, tier).toBeDefined();
      expect(def!.provider).toBe("local");
    }
  });

  it("still costs nothing per token, because it is the owner's hardware", () => {
    const def = getModelDef("local-deepseek/sonnet")!;
    expect(def.inputCostPer1M).toBe(0);
    expect(def.outputCostPer1M).toBe(0);
  });
});

describe("the fleet fallback", () => {
  it("has its own model id, never the platform default", async () => {
    const { LOCAL_STAND_IN_MODEL_ID, FALLBACK_DEFAULT_MODEL_ID: dflt } = await import(
      "@/lib/llm/defaults"
    );
    // These were one constant until the default moved to OpenRouter, at which
    // point the "local stand-in" stopped being local and would have sent a
    // keyless writer back to a provider they have no key for.
    expect(LOCAL_STAND_IN_MODEL_ID).not.toBe(dflt);
    expect(getModelDef(LOCAL_STAND_IN_MODEL_ID)!.provider).toBe("local");
  });
});
