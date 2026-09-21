/**
 * Local fleet (LAN gateway) model wiring.
 *
 * Three invariants this file protects:
 *  1. Every gateway model the app offers is a real registry entry with all
 *     three tier slots, so role/cheap resolution never escapes the family.
 *  2. The registry ids and the proxy's DEFAULT_MODEL_MAP agree — a registry id
 *     the proxy cannot map would be silently served by the wrong model.
 *  3. The deployment default and the no-key fallback both resolve to the fleet.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODEL_REGISTRY,
  getModelDef,
  getModelsByProvider,
  resolveCheapModelFor,
} from "@/lib/llm/model-registry";

const FAMILIES = [
  "local-deepseek",
  "local-deepseek-v4",
  "local-qwenflash",
  "local-zika",
];
const TIERS = ["opus", "sonnet", "haiku"] as const;

describe("local fleet registry entries", () => {
  it.each(FAMILIES)("%s has all three tier slots on the local provider", (family) => {
    for (const tier of TIERS) {
      const def = getModelDef(`${family}/${tier}`);
      expect(def, `${family}/${tier} missing from registry`).toBeDefined();
      expect(def!.provider).toBe("local");
      expect(def!.tier).toBe(tier);
    }
  });

  it("prices every self-hosted model at zero", () => {
    for (const def of getModelsByProvider("local")) {
      expect(def.inputCostPer1M).toBe(0);
      expect(def.outputCostPer1M).toBe(0);
      expect(def.costTier).toBe("$");
    }
  });

  it("keeps cheap-tier resolution inside the same fleet family", () => {
    for (const family of FAMILIES) {
      expect(resolveCheapModelFor(`${family}/sonnet`).id).toBe(`${family}/haiku`);
    }
  });

  it("keeps the legacy local ids resolvable", () => {
    expect(getModelDef("local/qwen38")).toBeDefined();
    expect(getModelDef("local/qwen38-haiku")).toBeDefined();
  });

  it("resolves the legacy pair's cheap tier to its OWN sibling", () => {
    // The legacy ids share a display name but no prefix pattern; a provider-wide
    // search would hand them whichever local haiku sits first in the registry.
    expect(resolveCheapModelFor("local/qwen38").id).toBe("local/qwen38-haiku");
  });
});

describe("seams that must know about a keyless provider", () => {
  it("validates nothing for a provider that has no user key", async () => {
    // getProvider() throws on "local"; that threw a 500 out of the agent-start
    // route for every user on a local default.
    const { validateApiKey } = await import("@/lib/llm/key-validator");
    await expect(validateApiKey("local" as never, "local")).resolves.toEqual({
      valid: true,
    });
  });

  it("names the local fleet in provider error messages", async () => {
    const { translateProviderError } = await import("@/lib/llm/error-translator");
    const translated = translateProviderError(401, "local");
    expect(translated.userMessage).toContain("local fleet");
    expect(translated.userMessage).not.toContain("undefined");
  });

  it("derives a model's provider from the registry, not its id prefix", () => {
    // "local-deepseek/sonnet".split("/")[0] is "local-deepseek", which is not a
    // provider — the marketing-kit route 400'd on exactly this.
    expect(getModelDef("local-deepseek/sonnet")!.provider).toBe("local");
    expect(getModelDef("openrouter-qwen36/sonnet")!.provider).toBe("openrouter");
  });
});

describe("proxy model map parity", () => {
  const source = readFileSync(
    join(process.cwd(), "local-llm-proxy.py"),
    "utf-8",
  );
  const mapBlock = source.slice(
    source.indexOf("DEFAULT_MODEL_MAP = {"),
    source.indexOf("def _load_model_map"),
  );
  const mapped = [...mapBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => ({
    registryId: m[1],
    upstream: m[2],
  }));

  it("extracts a non-empty map (guards the parser itself)", () => {
    expect(mapped.length).toBeGreaterThan(10);
  });

  it("maps every registry id the proxy knows to a real registry entry", () => {
    for (const { registryId } of mapped) {
      expect(getModelDef(registryId), `${registryId} not in registry`).toBeDefined();
    }
  });

  it("maps every local registry model to a gateway model name", () => {
    const known = new Set(mapped.map((m) => m.registryId));
    for (const def of MODEL_REGISTRY.filter((m) => m.provider === "local")) {
      expect(known.has(def.id), `${def.id} has no proxy mapping`).toBe(true);
    }
  });
});

describe("deployment default", () => {
  const ORIGINAL = process.env.WMB_DEFAULT_MODEL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WMB_DEFAULT_MODEL;
    else process.env.WMB_DEFAULT_MODEL = ORIGINAL;
  });

  // The default moved off the fleet: a fleet default works on a box that HAS
  // a fleet and on no other. The fleet is still in the registry and still
  // catches keyless writers through WMB_LOCAL_FALLBACK below.
  it("defaults to DeepSeek V4.1 Flash on OpenRouter", async () => {
    delete process.env.WMB_DEFAULT_MODEL;
    const { getDefaultModelId } = await import("@/lib/llm/defaults");
    expect(getDefaultModelId()).toBe("openrouter-deepseek-flash/sonnet");
  });

  it("honours a valid WMB_DEFAULT_MODEL override", async () => {
    process.env.WMB_DEFAULT_MODEL = "local-zika/sonnet";
    const { getDefaultModelId } = await import("@/lib/llm/defaults");
    expect(getDefaultModelId()).toBe("local-zika/sonnet");
  });

  it("ignores an unknown WMB_DEFAULT_MODEL instead of billing a stranger", async () => {
    process.env.WMB_DEFAULT_MODEL = "acme/not-a-model";
    const { getDefaultModelId } = await import("@/lib/llm/defaults");
    expect(getDefaultModelId()).toBe("openrouter-deepseek-flash/sonnet");
  });
});

describe("no-key fallback to the fleet", () => {
  const ORIGINAL_FALLBACK = process.env.WMB_LOCAL_FALLBACK;
  const ORIGINAL_FORCE = process.env.WMB_LLM_FORCE_LOCAL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.WMB_LLM_FORCE_LOCAL;
  });

  afterEach(() => {
    if (ORIGINAL_FALLBACK === undefined) delete process.env.WMB_LOCAL_FALLBACK;
    else process.env.WMB_LOCAL_FALLBACK = ORIGINAL_FALLBACK;
    if (ORIGINAL_FORCE === undefined) delete process.env.WMB_LLM_FORCE_LOCAL;
    else process.env.WMB_LLM_FORCE_LOCAL = ORIGINAL_FORCE;
  });

  it("serves a keyless paid model from the fleet when enabled", async () => {
    process.env.WMB_LOCAL_FALLBACK = "1";
    const { createLLMClient } = await import("@/lib/llm/client-factory");
    const result = createLLMClient({ modelId: "anthropic/sonnet" });
    expect(result.model.provider).toBe("local");
    expect(result.model.id).toBe("local-deepseek/sonnet");
  });

  it("substitutes the fleet in the shared route helper, and says so", async () => {
    process.env.WMB_LOCAL_FALLBACK = "1";
    const { resolveRouteWithLocalFallback } = await import("@/lib/llm/client-factory");
    const { getModelDef: get } = await import("@/lib/llm/model-registry");
    const asked = get("anthropic/sonnet")!;
    const result = resolveRouteWithLocalFallback(asked, {});
    expect(result.route.route).toBe("direct");
    expect(result.model.id).toBe("local-deepseek/sonnet");
  });

  it("leaves a keyed model's route untouched", async () => {
    process.env.WMB_LOCAL_FALLBACK = "1";
    const { resolveRouteWithLocalFallback } = await import("@/lib/llm/client-factory");
    const { getModelDef: get } = await import("@/lib/llm/model-registry");
    const asked = get("anthropic/sonnet")!;
    const result = resolveRouteWithLocalFallback(asked, { anthropicApiKey: "sk-ant-x" });
    expect(result.model.id).toBe("anthropic/sonnet");
    expect(result.route.route).toBe("direct");
  });

  it("still fails honestly when the fallback is off", async () => {
    delete process.env.WMB_LOCAL_FALLBACK;
    const { createLLMClient } = await import("@/lib/llm/client-factory");
    expect(() => createLLMClient({ modelId: "anthropic/sonnet" })).toThrow(
      /No Anthropic or OpenRouter API key/,
    );
  });
});
