/**
 * H-10 — the chrome around the writer spoke English.
 *
 * Two scans over the signed-in app, both inventories rather than lists of
 * assertions: a new English string in a finished directory fails them, so it
 * cannot be added quietly.
 *
 *  - `englishJsxText` reads every run of literal text a reader sees, found by
 *    the TypeScript parser. The audit counted ~120; the parser found ~600.
 *  - `englishAttributes` reads the values a reader or a screen reader gets
 *    from inside a tag — `placeholder`, `title`, `aria-label` and friends,
 *    which no text scan can see.
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

/** Directories whose human-readable attributes are fully localized. */
const ATTRIBUTE_CLEAN_AREAS = [
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
 * Every run of literal text inside JSX, found by the parser.
 *
 * This replaced a regular expression that matched `>…<` with no braces in
 * between. Any run of text sitting *beside* an expression was structurally
 * invisible to it — `{words} words`, `{n} min remaining`, `{done} of {total}
 * sessions complete` — because the span it lived in contained braces. 276 of
 * them had survived that scan: units, counters and whole sentences broken by
 * a `{value}`.
 *
 * `JsxText` is exactly the text a reader sees and nothing else, so this needs
 * none of the old scan's guesses about which matches were really code.
 */
/** Directories whose JSX text is fully localized. Grows per phase. */
const PARSED_CLEAN_AREAS: string[] = [
  join("app", "(app)"),
  join("components", "agent"),
  join("components", "billing"),
  join("components", "book"),
  join("components", "editor"),
  join("components", "editorial"),
  join("components", "import-export"),
  join("components", "layout"),
  join("components", "memory"),
  join("components", "onboarding"),
  join("components", "reports"),
  join("components", "series"),
  join("components", "settings"),
  join("components", "style"),
];

/** `&middot;`, `&mdash;`, `&nbsp;` — a glyph spelled out, not a word. */
const HTML_ENTITY = /&(?:#\d+|[a-zA-Z]+);/g;

/**
 * The product's own name and its own domain. They appear together in the
 * footer of the draft certificate and the year-in-writing card, which are
 * images a writer shares — the line is a signature, not a sentence.
 */
const BRAND = /\bWriteMyBook\b|\b[\w-]+\.(?:com|net|org|io|app)\b/g;

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
      const words = text
        .replace(HTML_ENTITY, " ")
        .replace(BRAND, " ")
        // A key combination is printed raw in every language; see KEY_COMBO.
        .replace(KEY_COMBO, " ");
      if (/[a-z]/.test(words) && /[A-Za-z]{2}/.test(words)) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${file.slice(SRC.length + 1)}:${line + 1} — ${text.slice(0, 70)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/** Directories whose JSX *expressions* hold no English copy. Grows per phase. */
const EXPRESSION_CLEAN_AREAS: string[] = [
  join("app", "(app)"),
  join("components", "agent"),
  join("components", "book"),
  join("components", "editor"),
  join("components", "editorial"),
  join("components", "import-export"),
  join("components", "journey"),
  join("components", "memory"),
  join("components", "onboarding"),
  join("components", "reports"),
  join("components", "style"),
];

/** The pluralisation helpers: their noun forms are copy wherever they sit. */
const COPY_HELPERS = new Set(["pluralNoun", "countWithNoun"]);

/**
 * Does this literal reach the reader unchanged, as a child of a tag?
 *
 * The walk upward passes only through the nodes that choose between values
 * without transforming them — a ternary's two branches, the right side of
 * `&&` or `??`, a pair of brackets — and stops at anything else. So
 * `{editingId ? "Update" : "Create"}` is copy, while `move.status ===
 * "applied"` is a comparison against a stored slug and `formatDate(d, "PP")`
 * is a format string. Neither of those is ever printed.
 */
function choosingHost(node: ts.Node): ts.Node | undefined {
  let child: ts.Node = node;
  let parent = node.parent;
  while (parent) {
    if (ts.isJsxExpression(parent)) return parent.parent;
    if (ts.isParenthesizedExpression(parent)) {
      // Transparent.
    } else if (ts.isConditionalExpression(parent)) {
      if (parent.whenTrue !== child && parent.whenFalse !== child) return undefined;
    } else if (ts.isBinaryExpression(parent)) {
      const kind = parent.operatorToken.kind;
      const chooses =
        kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        kind === ts.SyntaxKind.BarBarToken ||
        kind === ts.SyntaxKind.QuestionQuestionToken;
      if (!chooses || parent.right !== child) return undefined;
    } else {
      return undefined;
    }
    child = parent;
    parent = parent.parent;
  }
  return undefined;
}

/** The literal ends up as a child of a tag — text the reader sees. */
function rendered(node: ts.Node): boolean {
  const host = choosingHost(node);
  return !!host && (ts.isJsxElement(host) || ts.isJsxFragment(host));
}

/**
 * The literal ends up as the value of an attribute a human reads or hears.
 *
 * The regular-expression attribute scan reads a quoted value, so it sees
 * `title="Pin to dashboard"` and nothing else; the expression scan above
 * stops at the tag by design. A ternary *inside* an attribute — `title={pinned
 * ? "Unpin" : "Pin"}` — sat between the two and was read by neither.
 */
function attributeCopy(node: ts.Node): boolean {
  const host = choosingHost(node);
  if (!host || !ts.isJsxAttribute(host)) return false;
  return (HUMAN_ATTRIBUTES as readonly string[]).includes(host.name.getText());
}

/** `pluralNoun(n, "chunk", "chunks")` — English grammar passed as arguments. */
function copyHelperArgument(node: ts.Node): boolean {
  const call = node.parent;
  if (!call || !ts.isCallExpression(call)) return false;
  if (!call.arguments.includes(node as ts.Expression)) return false;
  const callee = call.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : "";
  return COPY_HELPERS.has(name);
}

/** A `<style>` tag's child is a stylesheet, not a sentence. */
function insideStyleTag(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isJsxElement(n)) {
      const tag = n.openingElement.tagName;
      if (ts.isIdentifier(tag) && tag.text === "style") return true;
    }
  }
  return false;
}

function literalText(node: ts.Node): string {
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  }
  return (node as ts.StringLiteralLike).text;
}

/**
 * The third dimension: copy that lives inside a JSX expression.
 *
 * The text scan reads what sits between two tags and the attribute scan reads
 * what sits inside one. Neither can see a string that is chosen by code —
 * `{saving ? "Saving..." : "Save"}`, `` {`${n} words`} ``, a noun handed to
 * `pluralNoun`. Those were the last English strings the guard could not name.
 */
function copyLiterals(file: string, isCopy: (node: ts.Node) => boolean): string[] {
  const source = readWithoutComments(file);
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    const isLiteral =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateExpression(node);
    if (isLiteral && isCopy(node) && !insideStyleTag(node)) {
      const text = literalText(node).replace(/\s+/g, " ").trim();
      const words = text
        .replace(HTML_ENTITY, " ")
        .replace(BRAND, " ")
        .replace(KEY_COMBO, " ")
        // `{count}` is a slot in a dictionary value, not a word.
        .replace(/\{[A-Za-z]+\}/g, " ");
      // A URL is an example of a setting, not a sentence.
      if (/[a-z]/.test(words) && /[A-Za-z]{2}/.test(words) && !text.includes("://")) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${file.slice(SRC.length + 1)}:${line + 1} — ${text.slice(0, 70)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function englishJsxExpressions(file: string): string[] {
  return copyLiterals(file, (node) => rendered(node) || copyHelperArgument(node));
}

/**
 * The fifth dimension: copy a ternary hands to a human-read attribute.
 *
 * `title={saving ? "Saving..." : "Save"}` is the same sentence as
 * `{saving ? "Saving..." : "Save"}` — only the place it lands differs, and
 * the reader hears it either way.
 */
function englishAttributeExpressions(file: string): string[] {
  return copyLiterals(file, attributeCopy);
}

/** Directories whose attribute *expressions* hold no English. Grows per phase. */
const ATTRIBUTE_EXPRESSION_CLEAN_AREAS: string[] = [...ATTRIBUTE_CLEAN_AREAS];

/** Directories whose *definitions* hold no English copy. Grows per phase. */
const DEFINITION_CLEAN_AREAS: string[] = [
  join("app", "(app)"),
  join("components", "agent"),
  join("components", "book"),
  join("components", "editor"),
  join("components", "editorial"),
  join("components", "import-export"),
  join("components", "layout"),
  join("components", "memory"),
  join("components", "onboarding"),
  join("components", "reports"),
  join("components", "series"),
  join("components", "settings"),
];

/**
 * Property names whose value a reader sees. A component that keeps its copy
 * in a table — `{ id: "theme-midnight", label: "Midnight Theme", description:
 * "Deep blue editor theme" }` — renders `{r.label}`, which is an identifier.
 * No scan that reads JSX can see the words, because by then they are a
 * variable.
 */
const COPY_PROPERTIES = new Set([
  "label", "description", "desc", "title", "hint", "placeholder", "message", "text",
  "caption", "tooltip", "heading", "subtitle", "summary", "note", "name",
  "detail", "body", "help", "helpText", "errorMessage", "empty", "emptyText",
]);

/**
 * A table named for what it holds. `CATEGORY_LABELS` is keyed by the stored
 * slug — `{ style: "Style Preference", name: "Name/Spelling" }` — so the
 * property names carry no signal and the rule above cannot see the values.
 * The variable's own name is the signal.
 */
const COPY_TABLE_NAME = /(?:LABELS?|COPY|MESSAGES?|TEXTS?|TITLES?|DESCRIPTIONS?|NAMES?|HINTS?)$/i;

/** `window.confirm("…")` and friends: a sentence the browser prints. */
const DIALOG_METHODS = new Set(["confirm", "alert", "prompt"]);
/** `toast.success("…")`: a sentence sonner prints. */
const TOAST_METHODS = new Set(["success", "error", "info", "warning", "message", "loading"]);

/**
 * A class list, a colour or a CSS value is style, not a sentence. Tailwind
 * classes are the loudest false positive here: `text: "text-amber-950
 * dark:text-amber-100"` is a `text` property whose value is not text.
 */
function looksLikeStyle(value: string): boolean {
  if (/^(?:hsl|rgb|rgba|var|calc|url)\(/.test(value)) return true;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true;
  const tokens = value.trim().split(/\s+/);
  return (
    tokens.every((token) => /^[a-z0-9]+[a-z0-9:/\[\]().,%#_-]*$/.test(token)) &&
    tokens.some((token) => /[-:]/.test(token))
  );
}

/**
 * Devices and file formats that are named, not translated. A Kindle is a
 * Kindle in Serbian, and Markdown keeps its inventor's name everywhere; the
 * two surfaces that print them return the string directly rather than a key
 * whose value would be identical in all seven languages.
 */
/** Devices, formats and typefaces: named, never translated. */
const PRODUCT_NAMES = /^(?:Kindle|iPad|iPhone|Markdown|Typst|Garamond|Literata)$/;

/**
 * A hashtag is an address, not a sentence — `#amwriting` reaches the same
 * community whatever language the post around it is written in.
 */
const HASHTAG = /#[\w]+/g;

/**
 * The four subscription tiers. They are named in `billing/stripe-client.ts`,
 * which is where a customer's invoice takes them from, and M-9 decided
 * against translating a plan list whose names are products rather than words
 * — a half-translated list reads as a mistake.
 */
const PLAN_NAMES = /^(?:Founder|Indie Author|Professional|Publisher|Enterprise)$/;

/** Is this string a sentence for a reader, or a value for the code? */
function isProse(raw: string): boolean {
  const value = raw.replace(/\s+/g, " ").trim();
  if (looksLikeStyle(value)) return false;
  if (PRODUCT_NAMES.test(value) || PLAN_NAMES.test(value)) return false;
  const words = value.replace(HTML_ENTITY, " ").replace(BRAND, " ").replace(HASHTAG, " ");
  if (!/[a-z]/.test(words)) return false; // ISBN, EPUB, PDF
  if (!/[A-Za-z]{3}/.test(words)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(words)) return false; // camelCase identifier
  if (/^[a-z0-9]+([-_.][a-z0-9]+)+$/.test(words)) return false; // slug, key, path
  if (/^\{[A-Za-z]+\}$/.test(words)) return false; // a slot in a dictionary value
  if (words.includes("://") || words.startsWith("/")) return false;
  return true;
}

function isStringLike(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  );
}

/**
 * The fourth dimension: copy that never touches JSX.
 *
 * The other three scans all read the markup — between tags, inside a tag, or
 * an expression a tag renders. A string defined away from the markup reaches
 * the reader just as surely: a table of labels mapped over, a helper that
 * returns "just now", the sentence in `window.confirm`. This reads the three
 * shapes that actually carry copy and leaves the rest of the file alone.
 */
function englishDefinitions(file: string): string[] {
  const source = readWithoutComments(file);
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX
  );
  const found: string[] = [];
  const where = (node: ts.Node) =>
    `${file.slice(SRC.length + 1)}:${parsed.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

  const visit = (node: ts.Node): void => {
    // `{ label: "Midnight Theme" }`, and `detail: ok ? "…" : "…"` with it —
    // a property that means copy carries copy however the value is chosen.
    if (ts.isPropertyAssignment(node)) {
      const name =
        ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : "";
      if (COPY_PROPERTIES.has(name)) {
        const readValues = (value: ts.Node): void => {
          if (isStringLike(value)) {
            const text = literalText(value);
            if (isProse(text)) found.push(`${where(value)} ${name}: ${text.slice(0, 60)}`);
            return;
          }
          ts.forEachChild(value, readValues);
        };
        readValues(node.initializer);
      }
    }

    // `const CATEGORY_LABELS = { style: "Style Preference" }`
    const table = ts.isVariableDeclaration(node) && node.initializer
      && (ts.isObjectLiteralExpression(node.initializer)
        || ts.isArrayLiteralExpression(node.initializer)
        || isStringLike(node.initializer));
    if (table && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && COPY_TABLE_NAME.test(node.name.text) && node.initializer) {
      const name = node.name.text;
      const readValues = (value: ts.Node): void => {
        if (isStringLike(value) && isProse(literalText(value))) {
          found.push(`${where(value)} ${name}: ${literalText(value).slice(0, 60)}`);
        }
        ts.forEachChild(value, readValues);
      };
      readValues(node.initializer);
    }

    // `return "just now";`
    if (ts.isReturnStatement(node) && node.expression && isStringLike(node.expression)) {
      const value = literalText(node.expression);
      if (isProse(value)) found.push(`${where(node)} return ${value.slice(0, 60)}`);
    }

    // `window.confirm("…")`, `toast.success("…")`
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const owner = node.expression.expression.getText();
      const speaks =
        (DIALOG_METHODS.has(method) && (owner === "window" || owner === "globalThis")) ||
        (TOAST_METHODS.has(method) && owner.endsWith("toast"));
      if (speaks) {
        for (const argument of node.arguments) {
          if (isStringLike(argument) && isProse(literalText(argument))) {
            found.push(`${where(node)} ${method}(${literalText(argument).slice(0, 60)})`);
          }
        }
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

describe("the expressions the parsed areas render", () => {
  it("hold no English copy chosen by code", () => {
    const offenders = EXPRESSION_CLEAN_AREAS.flatMap((area) =>
      walk(join(SRC, area)).flatMap(englishJsxExpressions)
    );
    expect(offenders).toEqual([]);
  });
});

describe("the definitions behind the parsed areas", () => {
  it("hold no English copy outside the markup", () => {
    const offenders = DEFINITION_CLEAN_AREAS.flatMap((area) =>
      walk(join(SRC, area)).flatMap(englishDefinitions)
    );
    expect(offenders).toEqual([]);
  });
});

describe("the expressions the localized attributes take", () => {
  it("hold no English copy chosen by code", () => {
    const offenders = ATTRIBUTE_EXPRESSION_CLEAN_AREAS.flatMap((area) =>
      walk(join(SRC, area)).flatMap(englishAttributeExpressions)
    );
    expect(offenders).toEqual([]);
  });
});

describe("the attributes a human reads in the localized areas", () => {
  it("hold no hardcoded English value", () => {
    const offenders = ATTRIBUTE_CLEAN_AREAS.flatMap((area) =>
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
    // "Agent" is the same word in Serbian.
    sr: [
      // "Status" is the same word, and NaNoWriMo is an event's name.
      "notifStatus", "achNaNo",
      "docAgent", "minutesAbbrev", "fleschKincaid", "gunningFog", "colemanLiau", "enterprise"],
    de: [
      "focusThemeSepia", "lensRegister",
      // "Version" and "Agent" are spelled the same in German, and "{matches}
      // in {chapters}" needs no other preposition.
      "docVersion", "docAgent", "versionN", "matchesInChapters",
      // "Import" is the German word too.
      "versionImport",
      // "Import", "Genre" and "optional" are German words too.
      "importStep", "genre", "genreOptional",
      // "Pipeline" and "Status" are used as-is; NaNoWriMo is an event's name.
      "viewPipeline", "notifStatus", "achNaNo",
      "stepOptional", "syntax", "focusNormal", "upgrade", "name", "median",
      "register", "fleschKincaid", "gunningFog", "colemanLiau",
      "contextEditor", "themeSystem", "ghostwriter", "coach", "analyst",
      "profileStandard", "coverCropZoom", "coverCropPosition", "coverCropPositionH",
      "enterprise", "workflows",
    ],
    es: [
      "focusThemeSepia",
      // Spanish took "token" as a loanword, and "no" is the word itself.
      "minutesAbbrev", "tokensAbbrev", "tokensInOut", "feedbackNo", "no",
      // "Manual" is spelled the same in Spanish.
      "versionManual",
      // Spanish "serie" pluralises to "series", the English word exactly —
      // both the page title and the two plural forms of the noun.
      "title", "seriesFew", "seriesMany",
      "focusNormal", "error", "fleschKincaid", "gunningFog", "colemanLiau",
      "contextEditor", "coach", "editor", "coverCropZoom", "coverCropPositionH",
      "coverCropPositionV", "enterprise",
    ],
    fr: [
      // "session", "documents" and "Version" are the French words, spelled
      // the same.
      "versionN", "minutesAbbrev",
      // "Insertion", "Import" and "occurrence" are French words.
      "annInsertion", "versionImport", "occurrenceOne", "occurrenceFew", "occurrenceMany",
      // "Pipeline", "Style", "Bible" and "Architecture" are the French words.
      "viewPipeline", "foundStyle", "foundBible", "foundArchitecture",
      // "Correction" is the French word, spelled the same.
      "catCorrection",
      // "Style" and "Genre" are the French words.
      "styleStep", "genre", "sessionOne", "sessionFew", "sessionMany", "documentsCount",
      "insightSuggestion", "focusNormal", "seriesTabDocuments", "seriesTabStructure",
      "type", "dialogue", "distribution", "fleschKincaid", "gunningFog", "colemanLiau",
      "architecture", "documents", "sessionsUnit", "coach", "styleSection",
      "strict", "profileStandard", "coverCropZoom", "coverCropPosition",
      "coverCropPositionH", "coverCropPositionV", "consensus", "convergence",
      "enterprise", "pages", "actions",
    ],
    ru: ["gunningFog", "colemanLiau", "enterprise", "achNaNo"],
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
      "setup",
      "seriesPage",
    ] as const;
    const untranslated: string[] = [];

    for (const language of LANGUAGES.filter((l) => l !== "en")) {
      const dictionary = getUIStrings(language);
      const allowed = COGNATES[language] ?? [];
      for (const group of groups) {
        for (const [key, value] of Object.entries(en[group])) {
          const translated = (dictionary[group] as Record<string, string>)[key];
          expect(translated, `${language}.${group}.${key}`).toBeTruthy();
          // A template made of nothing but placeholders and punctuation —
          // "{workflow}: {countNoun}" — has no word to translate, so an
          // identical value is not evidence of anything. Flagging it forces
          // a cognate entry per language for a string that contains no
          // language at all.
          const hasWords =
            typeof value === "string" &&
            /\p{L}/u.test(value.replace(/\{\w+\}/g, ""));
          if (hasWords && translated === value && !allowed.includes(key)) {
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
