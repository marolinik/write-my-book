/**
 * The shared relative-time formatter.
 *
 * Five components had written this themselves and four returned English from
 * a helper — "just now", "3m ago", "Never" — where no scan over the markup
 * could see it. One formatter now serves them all, and it never invents a
 * word: every form comes from the dictionary the caller passes.
 */

import { describe, it, expect } from "vitest";
import { relativeTime } from "@/lib/i18n/relative-time";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const EN = getUIStrings("en").docLibrary;
const SR = getUIStrings("sr").docLibrary;

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

describe("relativeTime", () => {
  it("names the empty case rather than printing an epoch", () => {
    expect(relativeTime(null, "en-US", EN)).toBe(EN.never);
    expect(relativeTime(undefined, "en-US", EN)).toBe(EN.never);
    expect(relativeTime("not a date", "en-US", EN)).toBe(EN.never);
  });

  it("reads the last minute as now", () => {
    expect(relativeTime(new Date(), "en-US", EN)).toBe(EN.justNow);
    expect(relativeTime(minutesAgo(0.5), "en-US", EN)).toBe(EN.justNow);
  });

  it("counts minutes, then hours, then days", () => {
    expect(relativeTime(minutesAgo(12), "en-US", EN)).toBe("12m ago");
    expect(relativeTime(minutesAgo(60 * 5), "en-US", EN)).toBe("5h ago");
    expect(relativeTime(minutesAgo(60 * 24 * 3), "en-US", EN)).toBe("3d ago");
  });

  it("falls back to the date once a week has passed", () => {
    const when = minutesAgo(60 * 24 * 30);
    expect(relativeTime(when, "en-US", EN)).toBe(when.toLocaleDateString("en-US"));
  });

  it("speaks whichever language it is handed", () => {
    expect(relativeTime(new Date(), "sr-RS", SR)).toBe(SR.justNow);
    expect(relativeTime(minutesAgo(12), "sr-RS", SR)).toBe(SR.minutesAgo.replace("{n}", "12"));
    expect(SR.never).not.toBe(EN.never);
  });

  it("accepts the ISO string an API returns", () => {
    expect(relativeTime(minutesAgo(30).toISOString(), "en-US", EN)).toBe("30m ago");
  });
});
