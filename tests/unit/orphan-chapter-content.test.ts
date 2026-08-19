import { describe, it, expect } from "vitest";
import { isOrphanedChapterContent } from "@/lib/documents/orphan-chapter-content";

/**
 * D-190 / D-115 — chapter-scoped documents are keyed by
 * (bookId, type, chapter_number), never by chapter id. Delete chapter 2 and its
 * CHAPTER_CONTENT row survives; create a new chapter, which auto-defaults to
 * the freed number 2, and the editor serves the deleted prose to a brand-new
 * chapter under a "Fresh Start" badge — then adopts it on the first save
 * (200, no conflict) so the deleted words re-enter the manuscript silently.
 *
 * Without a schema change the only honest identity signal available is
 * chronology: a content document created BEFORE the chapter row that now
 * occupies its number cannot be that chapter's prose. Reorder keeps the pairing
 * (chapters and their documents are renumbered together, createdAt untouched),
 * so this test pins the rule and its deliberate conservatism: a chapter that
 * already has counted words is NEVER blanked, and missing timestamps fail
 * closed to "not orphaned" — hiding real prose would be worse than the defect.
 */

const T1 = new Date("2026-07-01T10:00:00Z"); // old chapter created
const T2 = new Date("2026-07-01T11:00:00Z"); // its prose saved
const T3 = new Date("2026-07-02T09:00:00Z"); // old chapter deleted, new one made

describe("isOrphanedChapterContent (D-190)", () => {
  it("flags a document that predates the chapter now holding its number", () => {
    expect(
      isOrphanedChapterContent({
        docCreatedAt: T2,
        chapterCreatedAt: T3,
        chapterWordCount: 0,
      })
    ).toBe(true);
  });

  it("does not flag a document created for its own chapter", () => {
    expect(
      isOrphanedChapterContent({
        docCreatedAt: T2,
        chapterCreatedAt: T1,
        chapterWordCount: 0,
      })
    ).toBe(false);
  });

  it("never flags a chapter that already has counted words", () => {
    // Adoption already happened on this book (pre-fix history) or the writer
    // has really written here — suppressing the prose now would be data loss.
    expect(
      isOrphanedChapterContent({
        docCreatedAt: T2,
        chapterCreatedAt: T3,
        chapterWordCount: 23,
      })
    ).toBe(false);
  });

  it("fails closed when either timestamp is missing", () => {
    expect(
      isOrphanedChapterContent({
        docCreatedAt: undefined,
        chapterCreatedAt: T3,
        chapterWordCount: 0,
      })
    ).toBe(false);
    expect(
      isOrphanedChapterContent({
        docCreatedAt: T2,
        chapterCreatedAt: null,
        chapterWordCount: 0,
      })
    ).toBe(false);
    expect(isOrphanedChapterContent({})).toBe(false);
  });

  it("accepts ISO strings (serialized rows) as well as Dates", () => {
    expect(
      isOrphanedChapterContent({
        docCreatedAt: T2.toISOString(),
        chapterCreatedAt: T3.toISOString(),
        chapterWordCount: 0,
      })
    ).toBe(true);
  });

  it("treats an identical timestamp as the chapter's own document", () => {
    expect(
      isOrphanedChapterContent({
        docCreatedAt: T2,
        chapterCreatedAt: T2,
        chapterWordCount: 0,
      })
    ).toBe(false);
  });
});
