/**
 * A-14 / A-16 / A-13 — the instructions an agent receives are finished
 * instructions.
 *
 * Four prompts open with "analyzing chapter {chapterNumber} of {bookName}" and
 * list "chapterNumber: {chapterNumber}" among the fields of a finding. Nothing
 * substituted them: there was no `.replace` anywhere in prompt-assembler.ts, so
 * the dev editor, the line editor, the beta panel and the continuity checker
 * each read the braces literally.
 *
 * The Coach had the opposite problem: in conductor mode its own base
 * instructions were REPLACED by the conductor block, and every interactive
 * session sets targetWorkflowId — so the coaching methodology and the
 * ReadAllChapters efficiency rule never ran in production at all.
 *
 * And the ghostwriter was told to call WriteChapter only inside REVISION MODE;
 * a fresh draft had no instruction to persist itself anywhere.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE_INSTRUCTIONS,
  WORKFLOW_INSTRUCTION_OVERRIDES,
  CONDUCTOR_WORKFLOW_INSTRUCTIONS,
  PROMPT_PLACEHOLDERS,
  fillPromptPlaceholders,
  placeholdersIn,
} from "@/lib/agents/prompt-assembler";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the placeholders a prompt leaves for the assembler", () => {
  it("are only ones the assembler knows how to fill", () => {
    const unknown: string[] = [];
    const blocks = {
      ...BASE_INSTRUCTIONS,
      ...WORKFLOW_INSTRUCTION_OVERRIDES,
      ...CONDUCTOR_WORKFLOW_INSTRUCTIONS,
    };
    for (const [key, text] of Object.entries(blocks)) {
      for (const token of placeholdersIn(text)) {
        if (!(PROMPT_PLACEHOLDERS as readonly string[]).includes(token)) {
          unknown.push(`${key}: ${token}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("are substituted with the run's own chapter and book", () => {
    const filled = fillPromptPlaceholders(
      'analyzing chapter {chapterNumber} of "{bookName}" — chapterNumber: {chapterNumber}',
      { chapterNumber: 7, bookName: "Solni listovi" }
    );
    expect(filled).toBe(
      'analyzing chapter 7 of "Solni listovi" — chapterNumber: 7'
    );
    expect(placeholdersIn(filled)).toEqual([]);
  });

  it("say so honestly when the run has no chapter in scope", () => {
    const filled = fillPromptPlaceholders("chapter {chapterNumber} of {bookName}", {});
    expect(filled).not.toContain("{");
    expect(filled).toContain("book-level");
    expect(filled).toContain("this book");
  });

  it("are actually filled by the assembler", () => {
    const assembler = read("lib", "agents", "prompt-assembler.ts");
    expect(assembler).toContain("fillPromptPlaceholders(block, {");
  });
});

describe("the Coach's own instructions", () => {
  const assembler = read("lib", "agents", "prompt-assembler.ts");

  it("are kept in conductor mode, not replaced by it", () => {
    // The conductor block is pushed after the base instructions now; the
    // else-branch that dropped the base is gone.
    const base = assembler.indexOf("const base = BASE_INSTRUCTIONS[definition.type];");
    const conductor = assembler.indexOf("buildConductorPrompt(", base);
    expect(base).toBeGreaterThan(0);
    expect(conductor).toBeGreaterThan(base);
    expect(assembler).not.toContain("// Base instructions (for non-conductor mode or specialist agents)");
  });

  it("still contain the efficiency rule that was being dropped", () => {
    expect(BASE_INSTRUCTIONS["writing-coach"]).toContain("ReadAllChapters");
  });
});

describe("the ghostwriter", () => {
  it("is told to save a fresh draft, not only a revision", () => {
    const prompt = BASE_INSTRUCTIONS["ghostwriter"];
    const revisionMode = prompt.indexOf("REVISION MODE");
    const outputFormat = prompt.indexOf("OUTPUT FORMAT:");
    const persistAfterOutput = prompt.indexOf("WriteChapter", outputFormat);
    expect(outputFormat).toBeGreaterThan(revisionMode);
    expect(persistAfterOutput).toBeGreaterThan(outputFormat);
    expect(prompt).toContain("not a saved chapter");
  });
});

describe("a delegated specialist", () => {
  it("is told which book it is working on", () => {
    const tools = read("lib", "agents", "tools.ts");
    expect(tools).not.toContain("bookName: undefined as string | undefined");
    expect(tools).toContain("bookName: delegatedBook?.name ?? undefined");
  });
});
