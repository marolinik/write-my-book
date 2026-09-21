/**
 * Month and weekday names come from `Intl`, not from the dictionary.
 *
 * Two components carried their own English `["Jan", …]`. The platform knows
 * these names in every language the product speaks, so the guard against them
 * is that the names actually differ by locale — not that someone translated
 * eighty-four strings by hand.
 */

import { describe, it, expect } from "vitest";
import { shortMonthNames, shortWeekdayNames } from "@/lib/i18n/calendar-names";

describe("calendar names", () => {
  it("give twelve months and seven weekdays", () => {
    expect(shortMonthNames("en-US")).toHaveLength(12);
    expect(shortWeekdayNames("en-US")).toHaveLength(7);
  });

  it("index months the way a month number does", () => {
    const months = shortMonthNames("en-US");
    expect(months[0]).toMatch(/^Jan/);
    expect(months[11]).toMatch(/^Dec/);
  });

  it("index weekdays the way `Date.getDay()` does — 0 is Sunday", () => {
    const days = shortWeekdayNames("en-US");
    expect(days[0]).toMatch(/^Sun/);
    expect(days[1]).toMatch(/^Mon/);
    expect(days[6]).toMatch(/^Sat/);
  });

  it("speak the locale they are handed", () => {
    expect(shortMonthNames("sr-RS")[0]).not.toBe(shortMonthNames("en-US")[0]);
    expect(shortMonthNames("ru-RU")[0]).not.toBe(shortMonthNames("en-US")[0]);
    expect(shortWeekdayNames("de-DE")[1]).not.toBe(shortWeekdayNames("en-US")[1]);
  });
});
