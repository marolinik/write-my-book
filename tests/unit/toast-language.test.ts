/**
 * H-10 (toasts) — 43 `toast.*()` calls spoke English to every writer.
 *
 * A toast is the product's only voice for "that worked" and "that failed".
 * A Serbian writer who deletes a book was told "Book deleted"; one whose
 * autosave broke was told "Autosave is failing — check your connection."
 * The dictionary had no key for any of it, so this is not a wiring gap —
 * the strings never existed.
 *
 * The scan below is the regression barrier: a new `toast.error("…")` with an
 * English literal fails this test, in any client surface.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const SRC = join(__dirname, "..", "..", "src");
const LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const TOAST_LITERAL = /toast\.(success|error|info|warning|loading|message)\(\s*(["'])([^"']+)\2/g;

describe("the toasts the writer is shown", () => {
  const files = [join(SRC, "app"), join(SRC, "components")].flatMap(walk);

  it("carry no hardcoded English literal in any client surface", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(TOAST_LITERAL)) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(
          `${file.slice(SRC.length + 1)}:${line} — ${match[3]}`
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the toast dictionary", () => {
  it("exists in every language", () => {
    for (const language of LANGUAGES) {
      expect(getUIStrings(language).toasts, language).toBeTruthy();
    }
  });

  it("is actually translated — no language ships the English text back", () => {
    const en = getUIStrings("en").toasts;
    const keys = Object.keys(en) as (keyof typeof en)[];
    expect(keys.length).toBeGreaterThan(30);

    for (const language of LANGUAGES.filter((l) => l !== "en")) {
      const dictionary = getUIStrings(language).toasts;
      for (const key of keys) {
        expect(dictionary[key], `${language}.${key}`).toBeTruthy();
        expect(dictionary[key], `${language}.${key}`).not.toBe(en[key]);
      }
    }
  });
});
