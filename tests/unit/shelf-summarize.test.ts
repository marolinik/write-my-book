import { describe, it, expect } from "vitest";
import { daysBetween, summarizeBook } from "@/lib/shelf/summarize-book";
import type { ShelfBookInput } from "@/lib/shelf/types";

const now = new Date("2026-07-03T12:00:00Z");

const book: ShelfBookInput = {
  id: "b1",
  name: "Ashfall",
  genre: "fantasy",
  status: "writing",
  wordCount: 42000,
  archivedAt: null,
  updatedAt: new Date("2026-07-01T12:00:00Z"),
  chapterCount: 18,
  pendingFindings: 2,
};

describe("daysBetween", () => {
  it("floors to whole days and never goes negative", () => {
    expect(daysBetween(now, new Date("2026-07-03T00:00:00Z"))).toBe(0);
    expect(daysBetween(now, new Date("2026-07-02T11:00:00Z"))).toBe(1);
    expect(daysBetween(now, new Date("2026-07-10T12:00:00Z"))).toBe(0); // future → clamped
  });
});

describe("summarizeBook", () => {
  it("maps fields, derives shelf, days, and the Continue deep-link", () => {
    const view = summarizeBook(
      book,
      { drafted: 12, analyzed: 4 },
      { id: "ch9", chapterNumber: 9 },
      now,
    );
    expect(view.shelf).toBe("waiting"); // 2 pending findings
    expect(view.words).toBe(42000);
    expect(view.chapters).toBe(18);
    expect(view.drafted).toBe(12);
    expect(view.analyzed).toBe(4);
    expect(view.lastTouchedDays).toBe(2);
    expect(view.lastChapterId).toBe("ch9");
    expect(view.lastChapterNumber).toBe(9);
  });

  it("null lastChapter → null deep-link fields (card falls back to Open)", () => {
    const view = summarizeBook(book, { drafted: 0, analyzed: 0 }, null, now);
    expect(view.lastChapterId).toBeNull();
    expect(view.lastChapterNumber).toBeNull();
  });
});
