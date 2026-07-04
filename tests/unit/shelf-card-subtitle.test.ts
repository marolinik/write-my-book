import { describe, it, expect } from "vitest";

import { buildSubtitle, lastTouched } from "@/lib/shelf/card-subtitle";
import { localeFor } from "@/lib/i18n/ui-strings";
import type { ShelfBookView } from "@/lib/shelf/types";

function makeBook(overrides: Partial<ShelfBookView> = {}): ShelfBookView {
  return {
    id: "b1",
    name: "Test Book",
    genre: null,
    shelf: "currentlyWriting",
    words: 2026,
    chapters: 4,
    pendingFindings: 0,
    lastTouchedDays: 0,
    drafted: 2,
    analyzed: 0,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lastChapterId: null,
    lastChapterNumber: null,
    ...overrides,
  };
}

describe("buildSubtitle — F6 locale sweep", () => {
  it("formats the word count with the user's locale, not the system locale", () => {
    // The F6 bug: bare toLocaleString() rendered the host locale. A Serbian
    // user must see grouped thousands as "2.026", an English user "2,026".
    const sr = buildSubtitle(makeBook(), localeFor("sr"));
    const en = buildSubtitle(makeBook(), localeFor("en"));

    expect(sr).toContain("2.026 words");
    expect(en).toContain("2,026 words");
    // Guard against them silently collapsing to the same output.
    expect(sr).not.toBe(en);
  });

  it("still renders the shelf-specific copy around the count", () => {
    const en = localeFor("en");
    expect(buildSubtitle(makeBook({ shelf: "currentlyWriting" }), en)).toContain(
      "drafted 2/4",
    );
    expect(buildSubtitle(makeBook({ shelf: "completed", chapters: 12 }), en)).toContain(
      "Finished · 2,026 words · 12 chapters",
    );
    expect(buildSubtitle(makeBook({ shelf: "archived" }), en)).toBe(
      "Archived · 2,026 words",
    );
  });

  it("uses pending-notes copy on the waiting shelf (no word count)", () => {
    const en = localeFor("en");
    expect(
      buildSubtitle(makeBook({ shelf: "waiting", pendingFindings: 1, chapters: 0 }), en),
    ).toBe("1 note pending");
    expect(
      buildSubtitle(makeBook({ shelf: "waiting", pendingFindings: 3, chapters: 5, analyzed: 2 }), en),
    ).toBe("3 notes pending · dev-edit 2/5 chapters");
  });

  it("lastTouched renders friendly relative phrases", () => {
    expect(lastTouched(0)).toBe("today");
    expect(lastTouched(1)).toBe("yesterday");
    expect(lastTouched(4)).toBe("4 days ago");
  });
});
