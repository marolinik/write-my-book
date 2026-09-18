import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getUIStrings, UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

/**
 * O1 — the Serbian UI read half-English on the surfaces the writer uses every
 * day. These are the strings he named; this keeps them out of the source once
 * they have moved into the dictionary, because the cheapest way to regress is
 * for the next hand to type the label inline again.
 */

const SURFACES: Array<{ file: string; gone: string[] }> = [
  {
    file: "src/app/(app)/books/[bookId]/page.tsx",
    gone: [
      ">Book Progress<",
      ">Word Count<",
      ">Recent Agent Sessions<",
      ">Editorial Findings<",
    ],
  },
  {
    file: "src/app/(app)/books/[bookId]/settings/page.tsx",
    gone: [
      ">Model Overrides<",
      '"Book Default Model"',
      ">Per-Role Overrides<",
      ">Resolution Preview<",
      ">Delete this book<",
    ],
  },
  {
    file: "src/app/(app)/series/[seriesId]/page.tsx",
    gone: [">Total Books<", ">Total Chapters<", ">Total Words<", ">Series Documents<"],
  },
  {
    file: "src/app/(app)/settings/billing/page.tsx",
    gone: [
      ">Total Sessions<",
      ">Input Tokens<",
      ">Output Tokens<",
      ">Contact Us<",
      ">Usage by Agent<",
    ],
  },
  {
    file: "src/app/(app)/not-found.tsx",
    gone: [">Page not found<"],
  },
  {
    file: "src/app/(app)/error.tsx",
    gone: [">Something went wrong<"],
  },
];

describe("O1 — main surfaces read from the dictionary", () => {
  for (const surface of SURFACES) {
    it(`${surface.file} has no inline English labels left`, () => {
      const source = readFileSync(join(process.cwd(), surface.file), "utf8");
      const offenders = surface.gone.filter((needle) => source.includes(needle));
      expect(offenders).toEqual([]);
    });
  }

  it("every UI locale actually translates the new keys", () => {
    const english = getUIStrings("en").screens;
    for (const lang of UI_SUPPORTED_LANGUAGES) {
      const screens = getUIStrings(lang.code).screens;
      for (const key of Object.keys(english) as Array<keyof typeof english>) {
        expect(screens[key], `${lang.code}.${key}`).toBeTruthy();
        // "Enterprise" and "BYOK" are the same word everywhere; everything else
        // being identical to English means the locale was never filled in.
        if (lang.code !== "en" && !["enterprise", "byok"].includes(key)) {
          expect(screens[key], `${lang.code}.${key} is still English`).not.toBe(
            english[key]
          );
        }
      }
    }
  });
});
