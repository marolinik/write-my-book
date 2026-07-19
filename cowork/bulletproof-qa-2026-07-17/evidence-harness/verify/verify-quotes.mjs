// verify/verify-quotes.mjs — narrative quote + number linter (W-F3 §2.3, §2.5).
//
// Countermeasure to the fabricated-quotation class (D-40/D-49: quotes "from" a doc
// that grep proved absent) and the invented-number class (D-45):
//   1. Every quoted span >= MIN_QUOTE_LEN chars in narrative/*.md must byte-match
//      some artifact in raw/ (or a committed corpus dir). Unmatched => lint fails.
//   2. Every digit-bearing sentence must cite a `check:<id>` token that exists in
//      checks/summary.machine.json. An uncited number is a violation.
//
// When narrative/ is empty (the default — narrative is optional), the lint is
// trivially clean. Runs standalone or is called by verify-bundle.
//
// Node built-ins only.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const MIN_QUOTE_LEN = 15;

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isFile()) out.push(p);
  }
  return out;
}

/** Load every raw artifact (+ optional corpus dirs) as a searchable byte haystack. */
function loadHaystacks(bundleDir, corpusDirs) {
  const haystacks = [];
  const rawDir = join(bundleDir, "raw");
  for (const f of listFiles(rawDir)) haystacks.push({ path: `raw/${f.split(/[\\/]/).pop()}`, bytes: readFileSync(f) });
  for (const cd of corpusDirs ?? []) {
    for (const f of listFiles(cd)) haystacks.push({ path: f, bytes: readFileSync(f) });
  }
  return haystacks;
}

/** Extract quoted spans from markdown: straight and smart double quotes. */
export function extractQuotes(text) {
  const quotes = [];
  const patterns = [/"([^"]{1,})"/g, /“([^”]{1,})”/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const span = m[1].trim();
      if (span.length >= MIN_QUOTE_LEN) quotes.push(span);
    }
  }
  return quotes;
}

/** Sentences that carry a digit but no `check:<id>` citation. */
export function extractUncitedNumbers(text, validIds) {
  const violations = [];
  // Strip fenced code + inline code (legitimate to show numbers there).
  const noCode = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  const lines = noCode.split(/\r?\n/);
  for (const line of lines) {
    if (!/\d/.test(line)) continue;
    if (/^\s{0,3}#/.test(line)) continue; // headings
    // dates / times / list markers alone are not claims
    const stripped = line.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").replace(/\b\d{1,2}:\d{2}\b/g, "");
    if (!/\d/.test(stripped)) continue;
    const cites = [...line.matchAll(/check:([A-Za-z0-9_.-]+)/g)].map((x) => x[1]);
    const hasValidCite = cites.some((c) => validIds.has(c));
    if (!hasValidCite) violations.push(line.trim());
  }
  return violations;
}

/**
 * @param {string} bundleDir
 * @param {{ corpusDirs?: string[] }} [opts]
 * @returns {{ ok: boolean, narrativeFiles: number, unmatchedQuotes: object[], uncitedNumbers: object[] }}
 */
export function verifyQuotes(bundleDir, opts = {}) {
  const narrativeDir = join(bundleDir, "narrative");
  const files = listFiles(narrativeDir).filter((f) => f.endsWith(".md"));
  const haystacks = loadHaystacks(bundleDir, opts.corpusDirs);

  let validIds = new Set();
  const summaryPath = join(bundleDir, "checks", "summary.machine.json");
  if (existsSync(summaryPath)) {
    try {
      const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
      validIds = new Set((summary.checks ?? []).map((c) => c.id));
    } catch {
      /* summary unreadable — treated as no valid ids */
    }
  }

  const unmatchedQuotes = [];
  const uncitedNumbers = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const short = file.split(/[\\/]/).pop();
    for (const q of extractQuotes(text)) {
      const needle = Buffer.from(q, "utf8");
      const found = haystacks.some((h) => h.bytes.indexOf(needle) !== -1);
      if (!found) unmatchedQuotes.push({ file: short, quote: q.slice(0, 120) });
    }
    for (const line of extractUncitedNumbers(text, validIds)) {
      uncitedNumbers.push({ file: short, line: line.slice(0, 160) });
    }
  }

  return {
    ok: unmatchedQuotes.length === 0 && uncitedNumbers.length === 0,
    narrativeFiles: files.length,
    unmatchedQuotes,
    uncitedNumbers,
  };
}
