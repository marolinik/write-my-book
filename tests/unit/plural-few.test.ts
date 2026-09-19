/**
 * Serbian counts in three, not two.
 *
 * "3 knjiga" was wrong on the shelf: Serbian takes the nominative singular for
 * 1 (and 21, 31…), a "few" form for 2–4 (and 22–24…), and a genitive plural
 * for 5–20 and everything ending in 5–0. Two forms per noun cannot express
 * that, which plural.ts said outright and left as a known limit (S3-24).
 */

import { describe, it, expect } from "vitest";
import { pluralNoun, countWithNoun } from "@/lib/i18n/plural";

const SR = { one: "knjiga", few: "knjige", many: "knjiga" };

describe("Serbian plural", () => {
  it("takes the singular for one", () => {
    expect(pluralNoun(1, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("knjiga");
  });

  it("takes the few form for two, three and four", () => {
    for (const n of [2, 3, 4]) {
      expect(pluralNoun(n, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("knjige");
    }
  });

  it("takes the many form from five up", () => {
    for (const n of [0, 5, 9, 11, 100]) {
      expect(pluralNoun(n, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("knjiga");
    }
  });

  it("follows the last digit past twenty", () => {
    expect(pluralNoun(21, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("knjiga");
    expect(pluralNoun(22, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("knjige");
    expect(pluralNoun(25, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("knjiga");
  });

  it("keeps the teens on the many form", () => {
    // 11–14 are the exception the last digit would get wrong.
    for (const n of [11, 12, 13, 14]) {
      expect(pluralNoun(n, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("knjiga");
    }
  });

  it("renders the count with it", () => {
    expect(countWithNoun(3, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("3 knjige");
    expect(countWithNoun(28, SR.one, SR.many, { few: SR.few, language: "sr" })).toBe("28 knjiga");
  });
});

describe("the two-form languages are untouched", () => {
  it("still picks singular or plural in English", () => {
    expect(pluralNoun(1, "chapter", "chapters")).toBe("chapter");
    expect(pluralNoun(3, "chapter", "chapters")).toBe("chapters");
    expect(countWithNoun(1, "chapter", "chapters")).toBe("1 chapter");
  });

  it("ignores a few form when the language does not use one", () => {
    expect(
      pluralNoun(3, "chapter", "chapters", { few: "chaptera", language: "en" })
    ).toBe("chapters");
  });

  it("falls back to the plural when Serbian has no few form to offer", () => {
    expect(pluralNoun(3, "knjiga", "knjiga", { language: "sr" })).toBe("knjiga");
  });
});
