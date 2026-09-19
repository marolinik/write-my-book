/**
 * A-29 / A-30 / A-31 / A-43 — the context an agent is promised is the context
 * it gets, and the budget counts what is actually sent.
 *
 *  - Five context-profile values were fiction. The loader tests `!== "none"`
 *    and injects the whole document, so `storyBible: "chapter-relevant"`,
 *    `"characters-only"`, `architecture: "chapter-only"`, `"act-level"` and
 *    `fingerprint: "summary"` all meant "full". Four agents were configured
 *    for a narrowed context they never received, and the budget was planned
 *    around a saving that never happened.
 *  - Seven injected sections were announced in no prompt's "CONTEXT YOU HAVE
 *    BEEN GIVEN" list, so an agent could neither use a block it did not know
 *    arrived nor report one that was trimmed away.
 *  - And smartTrim budgeted only the context sections: the base instructions,
 *    the workflow override and the conductor block were appended afterwards
 *    and never counted, which made every budget short by the size of the
 *    agent's own prompt.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllAgentDefinitions } from "@/lib/agents/definitions";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the context profile", () => {
  it("offers only the modes the loader implements", () => {
    const types = read("lib", "agents", "types.ts");
    const profile = types.slice(
      types.indexOf("export interface AgentContextProfile {"),
      types.indexOf("}", types.indexOf("export interface AgentContextProfile {"))
    );
    for (const fiction of [
      "chapter-relevant",
      "characters-only",
      "chapter-only",
      "act-level",
    ]) {
      expect(profile, `${fiction} is not implemented anywhere`).not.toContain(fiction);
    }
    expect(profile).toContain('fingerprint: "full" | "none"');
    expect(profile).toContain('storyBible: "full" | "none"');
    expect(profile).toContain('architecture: "full" | "none"');
  });

  it("is what every agent is actually configured with", () => {
    const allowed = {
      fingerprint: ["full", "none"],
      storyBible: ["full", "none"],
      synopsis: ["full", "none"],
      architecture: ["full", "none"],
      adjacentChapters: ["none", "summaries-all", "one-each"],
      seriesContext: ["full", "summary", "none"],
    } as const;
    const offenders: string[] = [];
    for (const def of getAllAgentDefinitions()) {
      for (const [field, values] of Object.entries(allowed)) {
        const actual = (def.contextProfile as unknown as Record<string, string>)[field];
        if (!(values as readonly string[]).includes(actual)) {
          offenders.push(`${def.type}.${field} = ${actual}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the series modes, which are the two that are real", () => {
    const assembler = read("lib", "agents", "prompt-assembler.ts");
    expect(assembler).toContain('profile.seriesContext === "full"');
    expect(assembler).toContain('profile.seriesContext === "summary"');
  });
});

describe("the prompt the agent receives", () => {
  const assembler = read("lib", "agents", "prompt-assembler.ts");

  it("lists the context blocks that are actually present", () => {
    expect(assembler).toContain("<context_inventory>");
    expect(assembler).toContain("sortedSections.map((s) => s.name)");
  });

  it("pays for its own instructions out of the budget", () => {
    expect(assembler).toContain("const instructionTokens = filledInstructions.reduce(");
    expect(assembler).toContain(
      "const contextBudget = Math.max(agentBudget - instructionTokens, MIN_CONTEXT_BUDGET);"
    );
    expect(assembler).toContain("smartTrim(sections, contextBudget)");
    expect(assembler).not.toContain("smartTrim(sections, agentBudget)");
  });

  it("builds the instructions before it trims, not after", () => {
    const instructionsBuilt = assembler.indexOf("const instructions: string[] = [];");
    const trimmed = assembler.indexOf("smartTrim(sections, contextBudget)");
    expect(instructionsBuilt).toBeGreaterThan(0);
    expect(trimmed).toBeGreaterThan(instructionsBuilt);
  });

  it("logs the split, so an overrun is visible", () => {
    expect(assembler).toContain("instructions ${instructionTokens}");
  });
});
