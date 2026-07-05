import { describe, it, expect } from "vitest";
import { applyChapterHeading } from "@/lib/import-export/export-pipeline";

describe("applyChapterHeading (F9/F10 export chapter titles)", () => {
  it("prepends the DB title when content has no heading", () => {
    const out = applyChapterHeading("The rain fell on the harbour.", 3, "The Arrival");
    expect(out).toBe("# The Arrival\n\nThe rain fell on the harbour.");
  });

  it("replaces an inconsistent in-content heading with the DB title", () => {
    const out = applyChapterHeading("## Chapter Three\n\nBody text.", 3, "The Arrival");
    expect(out).toBe("# The Arrival\n\nBody text.");
  });

  it("lets the DB title win over an existing level-1 heading", () => {
    const out = applyChapterHeading("# Old Wrong Title\n\nBody.", 3, "The Arrival");
    expect(out).toBe("# The Arrival\n\nBody.");
  });

  it("falls back to 'Chapter N' when no title is provided", () => {
    expect(applyChapterHeading("Body.", 5)).toBe("# Chapter 5\n\nBody.");
  });

  it("falls back to 'Chapter N' when the title is blank/whitespace", () => {
    expect(applyChapterHeading("Body.", 7, "   ")).toBe("# Chapter 7\n\nBody.");
    expect(applyChapterHeading("Body.", 8, "")).toBe("# Chapter 8\n\nBody.");
  });

  it("tolerates leading blank lines before an existing heading", () => {
    const out = applyChapterHeading("\n\n# Placeholder\n\nBody.", 2, "Real Title");
    expect(out).toBe("# Real Title\n\nBody.");
  });

  it("never emits a chapter with no heading or the book title as heading", () => {
    // Untitled chapter (no DB title, no in-content heading) still gets a heading.
    const out = applyChapterHeading("Just prose, no heading.", 4);
    expect(out.startsWith("# Chapter 4\n\n")).toBe(true);
  });
});
