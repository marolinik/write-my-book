// tests/unit/i18n-plural.test.ts
//
// D-163 — "1 chapters" appeared twice in the setup wizard. Counts must pick the
// locale's singular/plural noun form, the same way books/page.tsx already does
// with `bookList.book` / `bookList.books`.
import { describe, it, expect } from "vitest";
import { pluralNoun, countWithNoun } from "@/lib/i18n/plural";
import { getUIStrings, UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

describe("pluralNoun", () => {
  it("picks the singular form for exactly one", () => {
    expect(pluralNoun(1, "chapter", "chapters")).toBe("chapter");
  });

  it("picks the plural form for zero", () => {
    expect(pluralNoun(0, "chapter", "chapters")).toBe("chapters");
  });

  it("picks the plural form for many", () => {
    expect(pluralNoun(2, "chapter", "chapters")).toBe("chapters");
    expect(pluralNoun(17, "chapter", "chapters")).toBe("chapters");
  });
});

describe("countWithNoun", () => {
  it("never renders the D-163 string", () => {
    expect(countWithNoun(1, "chapter", "chapters")).toBe("1 chapter");
    expect(countWithNoun(1, "chapter", "chapters")).not.toBe("1 chapters");
  });

  it("renders plural counts", () => {
    expect(countWithNoun(0, "chapter", "chapters")).toBe("0 chapters");
    expect(countWithNoun(12, "chapter", "chapters")).toBe("12 chapters");
  });
});

describe("setup chapter noun coverage", () => {
  it("every supported UI locale carries both chapter noun forms", () => {
    expect(UI_SUPPORTED_LANGUAGES.length).toBe(7);
    for (const { code } of UI_SUPPORTED_LANGUAGES) {
      const s = getUIStrings(code).setup;
      expect(s.chapterOne, `setup.chapterOne missing for ${code}`).toBeTruthy();
      expect(s.chapterMany, `setup.chapterMany missing for ${code}`).toBeTruthy();
    }
  });

  it("English reads correctly at 1 and at 3", () => {
    const s = getUIStrings("en").setup;
    expect(countWithNoun(1, s.chapterOne, s.chapterMany)).toBe("1 chapter");
    expect(countWithNoun(3, s.chapterOne, s.chapterMany)).toBe("3 chapters");
  });
});
