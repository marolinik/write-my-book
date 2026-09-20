/**
 * H-10 (JSX text nodes) — the chrome around the writer spoke English.
 *
 * The audit counted ~120 hardcoded JSX text nodes; a scan that also follows
 * nodes across line breaks finds ~330 in the signed-in app. They are being
 * cleared area by area, and `CLEAN_AREAS` is the part of the tree that is
 * done: a new English literal in any of those directories fails this test.
 *
 * Public marketing and legal pages are deliberately out of scope — they are
 * one English document each, not product chrome.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const SRC = join(__dirname, "..", "..", "src");
const LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"];

/** Directories whose JSX text nodes are fully localized. Grows per phase. */
const CLEAN_AREAS = [
  join("components", "agent"),
  join("components", "editorial"),
  join("components", "editor"),
];

/**
 * A JSX text node: everything between a tag's `>` and the next `<`, with no
 * braces in between (a braced expression is already a lookup, not a literal).
 */
/** A negated class already spans newlines, so this needs no `s` flag (tsc target). */
const SPAN = />([^<>{}]+)</g;

/** Fragments that mean the match is code between two JSX islands, not prose. */
const CODE_MARKERS = [";", "=>", "const ", "return ", "&&", "||", '"', "=== ", "//", "*/"];

/** `) : isIdle ? (` and friends — a ternary straddling two JSX branches. */
const TERNARY = /^\)?\s*:|\?\s*\($/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return entry.endsWith(".tsx") ? [full] : [];
  });
}

function englishTextNodes(file: string): string[] {
  const source = readFileSync(file, "utf-8");
  const found: string[] = [];
  for (const match of source.matchAll(SPAN)) {
    const text = match[1].split(/\s+/).filter(Boolean).join(" ");
    if (!/[A-Za-z]{2}/.test(text)) continue;
    if (source[Math.max(0, match.index - 1)] === "=") continue; // arrow function
    if (CODE_MARKERS.some((marker) => text.includes(marker))) continue;
    if (TERNARY.test(text)) continue;
    if (!text.includes(" ") && text.length < 4) continue;
    const line = source.slice(0, match.index).split("\n").length;
    found.push(`${file.slice(SRC.length + 1)}:${line} — ${text.slice(0, 80)}`);
  }
  return found;
}

describe("the localized areas of the app", () => {
  it("hold no hardcoded English text node", () => {
    const offenders = CLEAN_AREAS.flatMap((area) =>
      walk(join(SRC, area)).flatMap(englishTextNodes)
    );
    expect(offenders).toEqual([]);
  });
});

describe("the dictionaries behind the localized areas", () => {
  /**
   * Words that are genuinely the same in a language as in English. Anything
   * not listed here that matches English is an untranslated copy-paste.
   */
  const COGNATES: Record<string, string[]> = {
    // German
    de: ["stepOptional", "syntax", "focusNormal", "upgrade"],
    // Spanish
    es: ["focusNormal", "error"],
    // French
    fr: ["insightSuggestion", "focusNormal"],
  };

  it("exist in every language", () => {
    for (const language of LANGUAGES) {
      expect(getUIStrings(language).agentUI, language).toBeTruthy();
      expect(getUIStrings(language).editorialUI, language).toBeTruthy();
      expect(getUIStrings(language).editorChrome, language).toBeTruthy();
    }
  });

  it("are translated everywhere except for listed cognates", () => {
    const en = getUIStrings("en");
    const groups = ["agentUI", "editorialUI", "editorChrome", "common"] as const;
    const untranslated: string[] = [];

    for (const language of LANGUAGES.filter((l) => l !== "en")) {
      const dictionary = getUIStrings(language);
      const allowed = COGNATES[language] ?? [];
      for (const group of groups) {
        for (const [key, value] of Object.entries(en[group])) {
          const translated = (dictionary[group] as Record<string, string>)[key];
          expect(translated, `${language}.${group}.${key}`).toBeTruthy();
          if (translated === value && !allowed.includes(key)) {
            untranslated.push(`${language}.${group}.${key} — ${value}`);
          }
        }
      }
    }
    expect(untranslated).toEqual([]);
  });

  it("keeps the {count} placeholder wherever English has one", () => {
    const en = getUIStrings("en").agentUI;
    const placeholders = (Object.keys(en) as (keyof typeof en)[]).filter((key) =>
      en[key].includes("{count}")
    );
    expect(placeholders.length).toBeGreaterThan(0);

    for (const language of LANGUAGES) {
      const dictionary = getUIStrings(language).agentUI;
      for (const key of placeholders) {
        expect(dictionary[key], `${language}.${key}`).toContain("{count}");
      }
    }
  });
});
