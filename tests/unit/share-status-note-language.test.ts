import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P4-S04 (UAT 2026-09-25): a Serbian book's public share page had every label
 * in Serbian — and one status line in English: "streak 1 | best 1 | drafted
 * 100% | beta 0%". The loader built it as a fixed English template, and the
 * page (and GET /api/share/[token]) passed it through verbatim. The words for
 * it were already in the dictionary, used by the owner's own snapshot page.
 */

const h = vi.hoisted(() => ({
  db: { book: { findFirst: vi.fn() } },
  getDailyWordCounts: vi.fn(),
  computeStreaks: vi.fn(),
  getAnalysisReport: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/writing-stats", () => ({
  getDailyWordCounts: h.getDailyWordCounts,
  computeStreaks: h.computeStreaks,
}));
vi.mock("@/lib/reports/analysis-report", () => ({ getAnalysisReport: h.getAnalysisReport }));

import { loadShareBook } from "@/lib/share/snapshot-data";

function book(language: string) {
  return {
    id: "b1",
    name: "Šapat ćutanja",
    language,
    genre: null,
    wordCount: 1000,
    targetWordCount: 0,
    series: null,
    healthSnapshot: null,
    chapters: [
      { id: "c1", chapterNumber: 1, title: "Jedan", status: "drafted", betaScore: null },
      { id: "c2", chapterNumber: 2, title: "Dva", status: "beta_passed", betaScore: 8 },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getDailyWordCounts.mockResolvedValue([]);
  h.computeStreaks.mockReturnValue({ currentStreak: 1, bestStreak: 3 });
  h.getAnalysisReport.mockResolvedValue({ hasReport: false });
});

describe("the share page's status line (P4-S04)", () => {
  it("is in the book's language", async () => {
    h.db.book.findFirst.mockResolvedValue(book("sr"));
    const s = getUIStrings("sr").snapshot;
    const { bookStatusNote } = await loadShareBook("b1", "u1");

    expect(bookStatusNote).toContain(`${s.currentStreak}${s.colon} 1`);
    expect(bookStatusNote).toContain(`${s.bestStreak}${s.colon} 3`);
    expect(bookStatusNote).toContain(`${s.draftedV}${s.colon} 100%`);
    expect(bookStatusNote).toContain(`${s.passBeta}${s.colon} 50%`);
    for (const english of ["streak", "best", "drafted"]) {
      expect(bookStatusNote.toLowerCase(), english).not.toContain(english);
    }
  });

  it("reads the same way in English", async () => {
    h.db.book.findFirst.mockResolvedValue(book("en"));
    const { bookStatusNote } = await loadShareBook("b1", "u1");
    expect(bookStatusNote).toBe(
      "Current streak: 1 | Best streak: 3 | Drafted: 100% | Passed beta: 50%"
    );
  });

  it("leaves out a streak that is not running", async () => {
    h.db.book.findFirst.mockResolvedValue(book("sr"));
    h.computeStreaks.mockReturnValue({ currentStreak: 0, bestStreak: 3 });
    const { bookStatusNote } = await loadShareBook("b1", "u1");
    expect(bookStatusNote).not.toContain(getUIStrings("sr").snapshot.currentStreak);
  });
});
