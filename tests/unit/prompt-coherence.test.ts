/**
 * A-19 / A-21 / A-22 / A-23 / A-24 — a prompt that contradicts itself, and a
 * check that could not fire.
 *
 *  - The beta panel was described as "10 distinct reader personas" in the
 *    agent definition and the workflow, and the prompt that runs simulates 5.
 *  - The dev editor was told to "work through the chapter in 4 phases" and
 *    given three.
 *  - Three prompts listed their finding categories twice, and the dev editor's
 *    two copies disagreed — the second silently dropped `continuity` and
 *    `prose`, the two the story-bible gap check depends on.
 *  - The AI-tell apparatus was hardcoded English on both sides (the line
 *    editor hunting "delve" and "tapestry", the ghostwriter forbidden from
 *    writing them), so on the owner's Serbian novel that check could not fire
 *    once.
 *  - And the book-identity section gave every writer in every language a
 *    Serbian document title to imitate.
 */

import { describe, it, expect } from "vitest";
import { BASE_INSTRUCTIONS, AGENT_CATEGORIES } from "@/lib/agents/prompt-assembler";
import { FINDING_CATEGORIES } from "@/lib/i18n/finding-labels";
import { getAgentDefinition } from "@/lib/agents/definitions";
import { getWorkflow } from "@/lib/agents/workflows";
import { selectSkillsForAgent } from "@/lib/agents/skills";
import { getAiTellGuidance, phraseTellsFor, hasPhraseTells } from "@/lib/agents/ai-tells";

describe("the beta panel", () => {
  it("is described as the size it actually is", () => {
    expect(BASE_INSTRUCTIONS["beta-reader"]).toContain("simulate 5 distinct reader personas");
    expect(getAgentDefinition("beta-reader")?.description).toContain("5 distinct reader personas");
    expect(getWorkflow("beta-read")?.description).toContain("5 reader personas");
    for (const text of [
      BASE_INSTRUCTIONS["beta-reader"],
      getAgentDefinition("beta-reader")?.description ?? "",
      getWorkflow("beta-read")?.description ?? "",
    ]) {
      expect(text).not.toMatch(/\b10 (distinct )?reader/);
    }
  });
});

describe("the dev editor's phases", () => {
  it("are counted the way they are listed", () => {
    const prompt = BASE_INSTRUCTIONS["dev-editor"];
    const declared = prompt.match(/Work through the chapter in (\d+) phases/);
    expect(declared).not.toBeNull();
    const listed = prompt.match(/^### Phase \d+:/gm)?.length ?? 0;
    expect(Number(declared![1])).toBe(listed);
  });

  it("holds for the line editor too", () => {
    const prompt = BASE_INSTRUCTIONS["line-editor"];
    const declared = prompt.match(/Work through the chapter in (\d+) phases/);
    const listed = prompt.match(/^### Phase \d+:/gm)?.length ?? 0;
    expect(Number(declared![1])).toBe(listed);
  });
});

describe("the categories an editorial agent is given", () => {
  it("are named once per prompt, not twice", () => {
    for (const type of Object.keys(AGENT_CATEGORIES)) {
      const prompt = BASE_INSTRUCTIONS[type];
      const mentions = prompt.match(/^CATEGORIES for /gm)?.length ?? 0;
      expect(mentions, `${type} still lists its categories twice`).toBe(0);
      expect(prompt).toContain("- category: Use ONLY these categories:");
    }
  });

  it("are all real categories the tool accepts", () => {
    for (const [type, categories] of Object.entries(AGENT_CATEGORIES)) {
      const unknown = categories.filter((c) => !(FINDING_CATEGORIES as string[]).includes(c));
      expect(unknown, `${type} names a category CreateFinding rejects`).toEqual([]);
      expect(categories.length).toBeGreaterThan(5);
    }
  });

  it("still let the dev editor file the gaps it is told to file", () => {
    // The dropped copy cost exactly these two.
    expect(AGENT_CATEGORIES["dev-editor"]).toContain("continuity");
    expect(AGENT_CATEGORIES["dev-editor"]).toContain("prose");
  });
});

describe("AI-tell detection", () => {
  it("gives an English book the English phrases", () => {
    const guidance = getAiTellGuidance("en");
    expect(guidance).toContain("delve into");
    expect(hasPhraseTells("en")).toBe(true);
  });

  it("gives a Serbian book Serbian phrases, not English ones", () => {
    const guidance = getAiTellGuidance("sr");
    expect(guidance).toContain("svedočanstvo o");
    expect(guidance).not.toContain('"delve into"');
    expect(phraseTellsFor("sr").length).toBeGreaterThan(10);
  });

  it("tells a language with no list to hunt calques instead of English phrases", () => {
    const guidance = getAiTellGuidance("fr");
    expect(hasPhraseTells("fr")).toBe(false);
    expect(guidance).toContain("CALQUES");
    expect(guidance).not.toContain('"delve into"');
  });

  it("gives every language the patterns that survive translation", () => {
    for (const lang of ["en", "sr", "fr", "zh"]) {
      expect(getAiTellGuidance(lang)).toContain("all run the same length");
    }
  });

  it("reaches the two agents that need it, in the book's language", () => {
    const lineEditor = selectSkillsForAgent("line-editor", "thriller", "sr");
    expect(lineEditor).toContain("svedočanstvo o");
    const ghostwriter = selectSkillsForAgent("ghostwriter", "thriller", "sr");
    expect(ghostwriter).toContain("svedočanstvo o");
    // A reader-facing analyst has no business with a rewriting checklist.
    expect(selectSkillsForAgent("market-reader", "thriller", "sr")).not.toContain(
      "AI Tell Detection"
    );
  });

  it("is no longer hardcoded English in the ghostwriter's own prompt", () => {
    const prompt = BASE_INSTRUCTIONS["ghostwriter"];
    expect(prompt).not.toContain('"delve"');
    expect(prompt).not.toContain("rich tapestry");
    expect(prompt).toContain("in THIS book's language");
  });
});
