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
import ts from "typescript";
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
  join("components", "agent"),
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

/** A JSX comment holds prose about the code, not copy for the reader. */
function readWithoutComments(file: string): string {
  return readFileSync(file, "utf-8").replace(
    /\{?\/\*[\s\S]*?\*\/\}?/g,
    // Blank it out but keep the newlines, so reported line numbers stay true.
    (comment) => comment.replace(/[^\n]/g, " ")
  );
}

function englishTextNodes(file: string): string[] {
  const source = readWithoutComments(file);
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

/**
 * Attributes whose value a human reads or hears: the grey text inside an
 * empty input, the native tooltip, the image description, the name a screen
 * reader announces for an icon-only button, and the `label` prop the design
 * system's own controls take.
 *
 * The text-node scan above cannot see any of them — they live *inside* the
 * tag, between the attribute's `=` and the value's closing quote, never
 * between two tags. A Serbian writer met English here long after the visible
 * copy had been translated.
 */
const HUMAN_ATTRIBUTES = [
  "aria-label",
  "aria-description",
  "placeholder",
  "title",
  "alt",
  "label",
] as const;

/**
 * `attr="text"`, `attr={"text"}`, `attr={'text'}` and ``attr={`text`}``.
 * The leading guard stops `label` from matching the tail of `aria-label`.
 */
const ATTRIBUTE = new RegExp(
  `(?:^|[^A-Za-z-])(${HUMAN_ATTRIBUTES.join("|")})=` +
    "(?:\"([^\"{}]*)\"|\{\"([^\"]*)\"\}|\{'([^']*)'\}|\{`([^`]*)`\})",
  "g"
);

/**
 * What is left of an attribute value once the parts that are not prose are
 * removed: `${…}` is already a lookup, and a key combination is printed
 * identically in every language — `<kbd>{s.keys}</kbd>` in the shortcuts
 * dialog renders the same raw string, so translating it on one surface only
 * would make the two disagree.
 */
const KEY_COMBO = /\(?\b(?:Ctrl|Cmd|Alt|Shift|Esc|Enter|Tab|Del|F\d{1,2})\b(?:\s*\+\s*\S+)*\)?/g;

function bareProse(value: string): string {
  return value.replace(/\$\{[^}]*\}/g, " ").replace(KEY_COMBO, " ");
}

function englishAttributes(file: string): string[] {
  const source = readWithoutComments(file);
  const found: string[] = [];
  for (const match of source.matchAll(ATTRIBUTE)) {
    const attribute = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    // A URL or a host:port is an example of a setting, not a sentence.
    if (value.includes("://")) continue;
    const prose = bareProse(value);
    // An all-caps token is an acronym or a format name (ISBN, EPUB, PDF) —
    // the same string in every language.
    if (!/[a-z]/.test(prose)) continue;
    if (!/[A-Za-z]{3}/.test(prose)) continue;
    if (prose.trim() === "WriteMyBook") continue;
    const line = source.slice(0, match.index).split("\n").length;
    found.push(
      `${file.slice(SRC.length + 1)}:${line} ${attribute}="${value.slice(0, 70)}"`
    );
  }
  return found;
}

/**
 * The same sweep, done by the TypeScript parser instead of a regular
 * expression — and it sees what the regex structurally cannot.
 *
 * `SPAN` above matches `>…<` with *no braces in between*, so any run of text
 * that sits beside an expression is invisible to it: `{words} words`,
 * `{n} min remaining`, `{done} of {total} sessions complete`. The span those
 * live in contains braces, so the regex skips the whole thing. 276 runs had
 * survived the text-node sweep that way — units, counters and whole sentences
 * broken by a `{value}`.
 *
 * `JsxText` is exactly the text a reader sees and nothing else, so this scan
 * has no code false positives and needs none of the `CODE_MARKERS` guesswork.
 * `PARSED_CLEAN_AREAS` grows per phase the way `CLEAN_AREAS` did; when it
 * covers everything the list above does, the regex scan is deleted.
 */
const PARSED_CLEAN_AREAS: string[] = [
  join("components", "billing"),
  join("components", "editorial"),
  join("components", "layout"),
  join("components", "memory"),
  join("components", "onboarding"),
  join("components", "settings"),
  join("components", "style"),
];

/** `&middot;`, `&mdash;`, `&nbsp;` — a glyph spelled out, not a word. */
const HTML_ENTITY = /&(?:#\d+|[a-zA-Z]+);/g;

function englishJsxText(file: string): string[] {
  const source = readFileSync(file, "utf-8");
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      const words = text.replace(HTML_ENTITY, " ");
      // The product's own name is the product's own name in every language.
      if (words.trim() !== "WriteMyBook" && /[a-z]/.test(words) && /[A-Za-z]{2}/.test(words)) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${file.slice(SRC.length + 1)}:${line + 1} — ${text.slice(0, 70)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

describe("the parsed areas of the app", () => {
  it("hold no English text beside an expression either", () => {
    const offenders = PARSED_CLEAN_AREAS.flatMap((area) =>
      walk(join(SRC, area)).flatMap(englishJsxText)
    );
    expect(offenders).toEqual([]);
  });
});

describe("the attributes a human reads in the localized areas", () => {
  it("hold no hardcoded English value", () => {
    const offenders = CLEAN_AREAS.flatMap((area) =>
      walk(join(SRC, area)).flatMap(englishAttributes)
    );
    expect(offenders).toEqual([]);
  });
});

describe("the dictionaries behind the localized areas", () => {
  /**
   * Words that are genuinely the same in a language as in English. Anything
   * not listed here that matches English is an untranslated copy-paste.
   *
   * "min" is the SI-style abbreviation for a minute and is written the same
   * in Serbian, Spanish and French; only Russian and Chinese differ.
   *
   * `enterprise` is the fourth entry in a plan list whose other three names —
   * Founder, Professional, Publisher — come from `billing/stripe-client.ts`
   * and are product names, not words. Translating only the fourth would make
   * the list read as a mistake (M-9, decided rather than changed).
   */
  const COGNATES: Record<string, string[]> = {
    // The readability indices are named after their authors — proper nouns
    // in every language.
    sr: ["minutesAbbrev", "fleschKincaid", "gunningFog", "colemanLiau", "enterprise"],
    de: [
      "focusThemeSepia", "lensRegister",
      "stepOptional", "syntax", "focusNormal", "upgrade", "name", "median",
      "register", "fleschKincaid", "gunningFog", "colemanLiau",
      "contextEditor", "themeSystem", "ghostwriter", "coach", "analyst",
      "profileStandard", "coverCropZoom", "coverCropPosition", "coverCropPositionH",
      "enterprise", "workflows",
    ],
    es: [
      "focusThemeSepia",
      // Spanish took "token" as a loanword, and "no" is the word itself.
      "minutesAbbrev", "tokensAbbrev", "tokensInOut", "feedbackNo",
      "focusNormal", "error", "fleschKincaid", "gunningFog", "colemanLiau",
      "contextEditor", "coach", "editor", "coverCropZoom", "coverCropPositionH",
      "coverCropPositionV", "enterprise",
    ],
    fr: [
      "minutesAbbrev",
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
