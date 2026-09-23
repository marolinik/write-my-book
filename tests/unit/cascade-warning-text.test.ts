import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cascadeWarningText, legacyCascadeWarning } from "@/lib/editorial/cascade-text";

/**
 * A cascade warning tells the writer that a finding in one chapter may affect
 * another. It was written in English into every book:
 * "[Cascade] Ch.3 finding may affect this chapter: Pismo koje M…", a Serbian
 * finding wrapped in English, on the owner's Serbian novel.
 */

describe("cascadeWarningText", () => {
  it("is written in the book's language around the original finding", () => {
    const sr = cascadeWarningText("sr", 3, "Pismo koje Milena piše nema datum.");
    expect(sr.description).toContain("3");
    expect(sr.description).toContain("Pismo koje Milena piše nema datum.");
    expect(sr.description).not.toMatch(/may affect|Cascade|Ch\./);
    expect(sr.suggestion).toContain("3");
    expect(sr.suggestion).not.toMatch(/Review this chapter/);
  });

  it("falls back to English for a language without a dictionary", () => {
    expect(cascadeWarningText("xx", 2, "d").description).toMatch(/chapter 2/i);
  });

  for (const lang of ["en", "sr", "de", "es", "fr", "ru", "zh"]) {
    it(`has its own words in ${lang}`, () => {
      const t = cascadeWarningText(lang, 7, "X");
      expect(t.description).toContain("7");
      expect(t.description).toContain("X");
      expect(t.description).not.toContain("{");
      expect(t.suggestion).not.toContain("{");
    });
  }
});

describe("legacyCascadeWarning — reading the rows already written in English", () => {
  it("recovers the chapter and the original finding", () => {
    expect(legacyCascadeWarning("[Cascade] Ch.3 finding may affect this chapter: Pismo koje M…")).toEqual({
      fromChapter: 3,
      original: "Pismo koje M…",
    });
    expect(legacyCascadeWarning("Something else")).toBeNull();
  });
});

describe("post-session writes cascade warnings through it", () => {
  it("no longer carries the English template", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/agents/post-session.ts"), "utf8");
    expect(src).not.toContain("finding may affect this chapter");
    expect(src).toContain("cascadeWarningText(");
  });
});
