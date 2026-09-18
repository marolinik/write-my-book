/**
 * Serbian in this product is written in Latin script.
 *
 * `enforceBookScript` holds the model to it, the dictionaries are Latin, and
 * the writer's own manuscript is Latin — but dates and numbers go through Intl,
 * and the locale tag was `sr-RS`, whose default script is Cyrillic. So the
 * style page read "Style captured 17. сеп 2026." on an otherwise Latin screen
 * (S3-11).
 */

import { describe, it, expect } from "vitest";
import { localeFor } from "@/lib/i18n/ui-strings";

const CYRILLIC = /[Ѐ-ӿ]/;
const WHEN = new Date("2026-09-17T12:00:00Z");

describe("Serbian formatting stays in Latin script", () => {
  it("asks Intl for the Latin variant", () => {
    expect(localeFor("sr")).toContain("Latn");
  });

  it("formats a long date without a Cyrillic letter in it", () => {
    const formatted = WHEN.toLocaleDateString(localeFor("sr"), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(formatted).not.toMatch(CYRILLIC);
  });

  it("formats a month name without a Cyrillic letter in it", () => {
    const formatted = WHEN.toLocaleDateString(localeFor("sr"), { month: "long" });
    expect(formatted).not.toMatch(CYRILLIC);
  });

  it("still formats numbers with the Serbian separators", () => {
    expect((56874).toLocaleString(localeFor("sr"))).toBe("56.874");
  });

  it("leaves the other languages alone", () => {
    expect(localeFor("ru")).toBe("ru-RU");
    expect(localeFor("en")).toBe("en-US");
  });
});
