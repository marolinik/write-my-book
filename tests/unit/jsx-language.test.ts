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
  join("components", "series"),
  join("components", "import-export"),
  join("components", "shelf"),
  join("components", "journey"),
  join("components", "book"),
  join("components", "reports"),
  join("components", "style"),
  join("components", "memory"),
  join("components", "settings"),
  join("components", "billing"),
  join("components", "onboarding"),
  join("components", "layout"),
  join("app", "(app)"),
];

/**
 * A JSX text node: everything between a tag's `>` and the next `<`, with no
 * braces in between (a braced expression is already a lookup, not a literal).
 */
/** A negated class already spans newlines, so this needs no `s` flag (tsc target). */
const SPAN = />([^<>{}]+)</g;

/** Fragments that mean the match is code between two JSX islands, not prose. */
const CODE_MARKERS = [";", "=>", "const ", "return ", "&&", "||", '"', "=== ", "//", "*/", "): ", " ? "];

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
  // A JSX comment holds prose about the code, not copy for the reader.
  const source = readFileSync(file, "utf-8").replace(
    /\{?\/\*[\s\S]*?\*\/\}?/g,
    // Blank it out but keep the newlines, so reported line numbers stay true.
    (comment) => comment.replace(/[^\n]/g, " ")
  );
  const found: string[] = [];
  for (const match of source.matchAll(SPAN)) {
    const text = match[1].split(/\s+/).filter(Boolean).join(" ");
    if (!/[A-Za-z]{2}/.test(text)) continue;
    if (source[Math.max(0, match.index - 1)] === "=") continue; // arrow function
    if (CODE_MARKERS.some((marker) => text.includes(marker))) continue;
    if (TERNARY.test(text)) continue;
    // An all-caps token is a format or an acronym (EPUB, DOCX, PDF) — the
    // same string in every language, so it is not a translation gap.
    if (!/[a-z]/.test(text)) continue;
    // The product's own name is the product's own name in every language.
    if (text === "WriteMyBook") continue;
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
   *
   * `enterprise` is the fourth entry in a plan list whose other three names —
   * Founder, Professional, Publisher — come from `billing/stripe-client.ts`
   * and are product names, not words. Translating only the fourth would make
   * the list read as a mistake (M-9, decided rather than changed).
   */
  const COGNATES: Record<string, string[]> = {
    // The readability indices are named after their authors — proper nouns
    // in every language.
    sr: ["fleschKincaid", "gunningFog", "colemanLiau", "enterprise"],
    de: [
      "stepOptional", "syntax", "focusNormal", "upgrade", "name", "median",
      "register", "fleschKincaid", "gunningFog", "colemanLiau",
      "contextEditor", "themeSystem", "ghostwriter", "coach", "analyst",
      "profileStandard", "coverCropZoom", "coverCropPosition", "coverCropPositionH",
      "enterprise", "workflows",
    ],
    es: [
      "focusNormal", "error", "fleschKincaid", "gunningFog", "colemanLiau",
      "contextEditor", "coach", "editor", "coverCropZoom", "coverCropPositionH",
      "coverCropPositionV", "enterprise",
    ],
    fr: [
      "insightSuggestion", "focusNormal", "seriesTabDocuments", "seriesTabStructure",
      "type", "dialogue", "distribution", "fleschKincaid", "gunningFog", "colemanLiau",
      "architecture", "documents", "sessionsUnit", "coach", "styleSection",
      "strict", "profileStandard", "coverCropZoom", "coverCropPosition",
      "coverCropPositionH", "coverCropPositionV", "consensus", "convergence",
      "enterprise", "pages", "actions",
    ],
    ru: ["gunningFog", "colemanLiau", "enterprise"],
    zh: ["fleschKincaid", "gunningFog", "colemanLiau", "enterprise"],
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
    const groups = [
      "agentUI",
      "editorialUI",
      "editorChrome",
      "common",
      "seriesUI",
      "importExportUI",
      "bookUI",
      "reportsUI",
      "styleUI",
      "memoryUI",
      "onboardingUI",
      "shortcuts",
      "appUI",
      "settings",
      "pagesUI",
      "billingUI",
      "bookSettings",
      "screens",
      "commandPalette",
      "editorial",
    ] as const;
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
