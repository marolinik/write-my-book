/**
 * A proposal must name the CHAPTER, not the number the chapter happened to
 * carry when it was written.
 *
 * S3-8, live: the editor proposed splitting chapter 28 — "Dnevnik" — at a
 * verbatim quote. The writer first accepted two merges higher up the book, and
 * every chapter below them moved up by two. By the time he pressed Accept on
 * the split, chapter 28 was "Klisura", and the engine correctly reported that
 * the quote was not in that chapter. The move was not wrong; its address was.
 *
 * Chapter numbers are a rendering of the reading order, not an identity. The
 * proposal carries chapter ids so accepting one move can never poison another.
 */

import { describe, it, expect } from "vitest";
import { planMove, type ChapterRef } from "@/lib/structure/moves";

const DNEVNIK = "Prva scena.\n\nIzašli su iz kapije i stali.\n\nDruga scena.";

/** The book as the proposal saw it: "Dnevnik" sits at 28. */
const whenProposed: ChapterRef[] = [
  { id: "c27", chapterNumber: 27, title: "Rok", wordCount: 1302, actNumber: 3 },
  { id: "c28", chapterNumber: 28, title: "Dnevnik", wordCount: 3665, actNumber: 3 },
  { id: "c29", chapterNumber: 29, title: "Klisura", wordCount: 2032, actNumber: 3 },
];

/** The same book after two merges above it: everything moved up by two. */
const afterMerges: ChapterRef[] = [
  { id: "c27", chapterNumber: 25, title: "Rok", wordCount: 1302, actNumber: 3 },
  { id: "c28", chapterNumber: 26, title: "Dnevnik", wordCount: 3665, actNumber: 3 },
  { id: "c29", chapterNumber: 28, title: "Klisura", wordCount: 2032, actNumber: 3 },
];

describe("a move follows its chapter, not its number", () => {
  it("splits the chapter it was written for after the numbering shifted", () => {
    const result = planMove(afterMerges, {
      kind: "split",
      chapterId: "c28",
      chapterNumber: 28, // stale: 28 is "Klisura" now
      anchorQuote: "Izašli su iz kapije i stali.",
      secondTitle: "Studenička",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.sourceChapterId).toBe("c28");
    }
  });

  it("merges the chapters it was written for after the numbering shifted", () => {
    const result = planMove(afterMerges, {
      kind: "merge",
      chapterIds: ["c27", "c28"],
      chapterNumbers: [27, 28], // stale
    });

    expect(result.ok).toBe(true);
  });

  it("still works from numbers alone, for proposals filed before this existed", () => {
    const result = planMove(whenProposed, {
      kind: "split",
      chapterNumber: 28,
      anchorQuote: "Izašli su iz kapije i stali.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.sourceChapterId).toBe("c28");
    }
  });

  it("fails loudly when the chapter it names is gone", () => {
    const result = planMove(afterMerges, {
      kind: "split",
      chapterId: "deleted-chapter",
      chapterNumber: 28,
      anchorQuote: "Izašli su iz kapije i stali.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("chapter_not_found");
    }
  });
});

/** Guards the reading the failure rested on, so the fixture cannot drift. */
describe("the fixture models the live failure", () => {
  it("has a different chapter at 28 after the merges", () => {
    const before = whenProposed.find((c) => c.chapterNumber === 28)?.title;
    const after = afterMerges.find((c) => c.chapterNumber === 28)?.title;
    expect(before).toBe("Dnevnik");
    expect(after).toBe("Klisura");
  });

  it("keeps the anchor only in Dnevnik", () => {
    expect(DNEVNIK).toContain("Izašli su iz kapije i stali.");
  });
});
