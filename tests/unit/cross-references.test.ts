/**
 * A-33 / A-34 / A-42 / A-44 / A-47 / A-27 — the second passage, the language of
 * the scaffolding, and three declarations that did nothing.
 *
 * The continuity checker's prompt has always REQUIRED `crossReferences`: the
 * passage that conflicts with the one it quotes. The tool accepted the array
 * and dropped it — no column, no reader, no verification — so a cross-book
 * conflict arrived as one quote plus an assertion, and the writer went
 * looking. The citation could not even name another book: chapterNumber with
 * no bookNumber, in a product whose O9 tools exist to read sibling books.
 */

import { describe, it, expect, vi } from "vitest";
import {
  verifyCrossReferences,
  formatCrossReferences,
  type CrossReferenceContext,
} from "@/lib/agents/cross-references";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDefinition } from "@/lib/agents/definitions";
import { BASE_INSTRUCTIONS } from "@/lib/agents/prompt-assembler";
import { CONTINUITY_CATEGORIES } from "@/lib/i18n/finding-labels";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

/** Exact-ish matcher standing in for the production fuzzy match. */
const similarity = (needle: string, haystack: string) =>
  haystack.includes(needle) ? 1 : 0;

function context(
  chapters: Record<string, { content: string; bookName?: string }>
): CrossReferenceContext {
  return {
    bookId: "book-1",
    userId: "user-1",
    seriesId: "series-1",
    readChapter: vi.fn(async (chapterNumber: number, bookNumber?: number) =>
      chapters[`${bookNumber ?? "this"}:${chapterNumber}`] ?? null
    ),
  };
}

describe("verifying a cited passage", () => {
  it("keeps a citation whose quote is really in that chapter", async () => {
    const result = await verifyCrossReferences(
      [{ chapterNumber: 3, paragraphNumber: 12, quote: "her left hand was bare" }],
      context({ "this:3": { content: "She turned. Her left hand was bare, and…" } }),
      (n, h) => (h.toLowerCase().includes(n.toLowerCase()) ? 1 : 0)
    );
    expect(result.verified).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("drops a citation whose quote is not there", async () => {
    const result = await verifyCrossReferences(
      [{ chapterNumber: 3, paragraphNumber: 12, quote: "she wore the ring" }],
      context({ "this:3": { content: "Her left hand was bare." } }),
      similarity
    );
    expect(result.verified).toHaveLength(0);
    expect(result.rejected[0].reason).toContain("not in chapter 3");
  });

  it("reaches a sibling book when the citation names one", async () => {
    const ctx = context({
      "1:9": { content: "The bridge burned in the spring.", bookName: "Prva kniga" },
    });
    const result = await verifyCrossReferences(
      [{ chapterNumber: 9, paragraphNumber: 4, quote: "The bridge burned", bookNumber: 1 }],
      ctx,
      similarity
    );
    expect(result.verified).toHaveLength(1);
    expect(result.verified[0].bookName).toBe("Prva kniga");
    expect(ctx.readChapter).toHaveBeenCalledWith(9, 1);
  });

  it("says so when the cited book or chapter has no text", async () => {
    const result = await verifyCrossReferences(
      [{ chapterNumber: 9, paragraphNumber: 4, quote: "anything", bookNumber: 4 }],
      context({}),
      similarity
    );
    expect(result.verified).toHaveLength(0);
    expect(result.rejected[0].reason).toContain("book 4, chapter 9");
  });

  it("is a no-op when there are no citations", async () => {
    const result = await verifyCrossReferences(undefined, context({}), similarity);
    expect(result).toEqual({ verified: [], rejected: [] });
  });
});

describe("rendering the citations for the writer", () => {
  it("names the book when the conflict crosses one", () => {
    const block = formatCrossReferences([
      { chapterNumber: 3, paragraphNumber: 12, quote: "her left hand was bare" },
      {
        chapterNumber: 9,
        paragraphNumber: 4,
        quote: "the bridge burned",
        bookNumber: 1,
        bookName: "Prva kniga",
      },
    ]);
    expect(block).toContain('ch. 3, ¶12: "her left hand was bare"');
    expect(block).toContain('Prva kniga, ch. 9, ¶4: "the bridge burned"');
  });

  it("renders nothing when nothing survived verification", () => {
    expect(formatCrossReferences([])).toBe("");
  });
});

describe("the finding that carries them", () => {
  const tools = read("lib", "agents", "tools.ts");

  it("folds the verified citations into the rationale that is persisted", () => {
    expect(tools).toContain("const crossRefBlock = formatCrossReferences(crossRefs.verified)");
    expect(tools).toContain("rationale: enforceBookScript(rationaleWithRefs, lang)");
  });

  it("accepts a citation that names another book of the series", () => {
    expect(tools).toContain("Only for a conflict with ANOTHER book in the series");
  });

  it("tells the agent which citations were dropped", () => {
    expect(tools).toContain("cross-reference(s) were NOT recorded");
  });

  it("labels the block in the writer's language", () => {
    expect(getAgentStrings("sr").conflictingPassages).toBe("Pasusi koji su u sukobu");
    expect(getAgentStrings("en").conflictingPassages).toBe("Conflicting passages");
  });
});

describe("the continuity vocabulary", () => {
  it("is one list — the domains the report groups by", () => {
    const description = getAgentDefinition("continuity-checker")?.description ?? "";
    for (const domain of ["characters", "relationships", "timeline", "geography", "objects"]) {
      expect(description.toLowerCase()).toContain(domain);
    }
    // "foreshadowing" is a category of its own, not a continuity domain.
    expect(CONTINUITY_CATEGORIES).not.toContain("continuity:foreshadowing");
  });

  it("maps each analysis phase onto the domain it files under", () => {
    const prompt = BASE_INSTRUCTIONS["continuity-checker"];
    expect(prompt).toContain("files continuity:characters");
    expect(prompt).toContain("files continuity:world");
    expect(prompt).toContain("files continuity:timeline");
    expect(prompt).toContain("files continuity:objects");
  });
});

describe("the scaffolding inside the context blocks", () => {
  it("is written in the book's language, not always English", () => {
    expect(read("lib", "agents", "writer-memory.ts")).toContain("strings.memoryHeader");
    expect(read("lib", "agents", "session-brief.ts")).toContain(
      "strings.sessionContinuityHeader"
    );
    expect(getAgentStrings("sr").memoryHeader).toContain("Pisac");
    expect(getAgentStrings("sr").decisionsLabel).toBe("Odluke");
  });

  it("is passed the language by the assembler", () => {
    const assembler = read("lib", "agents", "prompt-assembler.ts");
    expect(assembler).toMatch(/formatWriterMemoryForPrompt\([^)]*context\.language/s);
    expect(assembler).toMatch(/formatBriefsForPrompt\([^)]*context\.language/s);
  });
});

describe("two declarations that did nothing", () => {
  it("the prerequisite type that always passed is gone", () => {
    expect(read("lib", "agents", "prerequisites.ts")).not.toContain("chapter_status");
    // The union that declares the prerequisite kinds no longer offers it.
    expect(read("lib", "agents", "types.ts")).toContain(
      'type: "document" | "chapter_content" | "manuscript";'
    );
  });

  it("the spawn option that was never read is gone", () => {
    const types = read("lib", "agents", "types.ts");
    const spawn = types.slice(
      types.indexOf("export interface AgentSpawnOptions {"),
      types.indexOf("}", types.indexOf("export interface AgentSpawnOptions {"))
    );
    expect(spawn).not.toContain("model: ModelTier;");
    expect(spawn).toContain("agentType: AgentType;");
  });
});
