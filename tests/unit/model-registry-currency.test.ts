/**
 * A-25 / A-26 — the Claude models the app offers are Claude models that exist,
 * priced at what they cost, and no dead config claims to constrain them.
 *
 * The registry served `claude-opus-4-6` and `claude-sonnet-4-5-20250929` —
 * both predating the Claude 5 family — at 2024-era prices (opus $15/$75 when
 * Opus 5 is $5/$25), so every cost estimate the writer saw for an Anthropic
 * model was wrong by 3x. `getModelId()` carried a third copy of those IDs and
 * was called from nowhere. `allowedModels` was declared on all 14 agents and
 * read nowhere — the enforced gate is WorkflowDefinition.minimumTier.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODEL_REGISTRY, getModelDef } from "@/lib/llm/model-registry";
import { getAllAgentDefinitions } from "@/lib/agents/definitions";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the Claude models in the registry", () => {
  it("are current model IDs", () => {
    expect(getModelDef("anthropic/opus")?.modelId).toBe("claude-opus-5");
    expect(getModelDef("anthropic/sonnet")?.modelId).toBe("claude-sonnet-5");
    expect(getModelDef("anthropic/haiku")?.modelId).toBe("claude-haiku-4-5");
    expect(getModelDef("openrouter/opus")?.modelId).toBe("anthropic/claude-opus-5");
    expect(getModelDef("openrouter/sonnet")?.modelId).toBe("anthropic/claude-sonnet-5");
    expect(getModelDef("openrouter/haiku")?.modelId).toBe("anthropic/claude-haiku-4-5");
  });

  it("carry no ID from before the Claude 5 family", () => {
    const stale = MODEL_REGISTRY.filter((m) =>
      /claude-(opus|sonnet)-4-[0-9]/.test(m.modelId)
    ).map((m) => `${m.id} -> ${m.modelId}`);
    expect(stale).toEqual([]);
  });

  it("price Opus 5 and Sonnet 5 at their published rates", () => {
    expect(getModelDef("anthropic/opus")?.inputCostPer1M).toBe(5);
    expect(getModelDef("anthropic/opus")?.outputCostPer1M).toBe(25);
    expect(getModelDef("anthropic/sonnet")?.inputCostPer1M).toBe(2);
    expect(getModelDef("anthropic/sonnet")?.outputCostPer1M).toBe(10);
    expect(getModelDef("anthropic/haiku")?.inputCostPer1M).toBe(1);
    expect(getModelDef("anthropic/haiku")?.outputCostPer1M).toBe(5);
  });
});

describe("the agent definitions", () => {
  it("no longer declare a model constraint nothing enforces", () => {
    for (const def of getAllAgentDefinitions()) {
      expect(def).not.toHaveProperty("allowedModels");
    }
    expect(read("lib", "agents", "types.ts")).not.toMatch(
      /^\s*allowedModels: ModelTier\[\];/m
    );
  });

  it("no longer carry a second, dead model-ID table", () => {
    const definitions = read("lib", "agents", "definitions.ts");
    expect(definitions).not.toContain("export function getModelId");
    expect(definitions).not.toContain("claude-opus-4-6");
  });
});
