/**
 * O1 — find user-visible English text that does not go through the dictionary.
 *
 *   npx tsx scripts/scan-hardcoded-ui-strings.ts [--path src/app]
 *
 * The Serbian UI still reads half-English on the main surfaces because strings
 * were written inline. This reports the literals a writer would actually see:
 * JSX text nodes and the user-facing string props (title, placeholder, label,
 * aria-label, alt, description, emptyLabel).
 *
 * Heuristic by nature, so it errs toward reporting: a false positive costs one
 * glance, a missed string costs a Serbian writer an English screen. Reports
 * only; changes nothing.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();

/** Props whose value is rendered to the user. */
const USER_FACING_PROPS = [
  "title",
  "placeholder",
  "label",
  "aria-label",
  "alt",
  "description",
  "emptyLabel",
  "tooltip",
];

/** Text that is not prose: keys, class names, ids, single symbols. */
function looksLikeProse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  // Needs at least two letters and a space, or one capitalised word of 4+.
  if (!/[A-Za-z]{2}/.test(trimmed)) return false;
  // Class names, paths, urls, template holes, code.
  if (/^[a-z-]+$/.test(trimmed)) return false;
  if (/[{}<>$\\/]/.test(trimmed)) return false;
  if (/^[A-Z_]+$/.test(trimmed)) return false;
  if (/^(https?:|\/|#)/.test(trimmed)) return false;
  // Must contain an English-looking word of 3+ letters.
  return /\b[A-Za-z]{3,}\b/.test(trimmed);
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else if (full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
  kind: "jsx-text" | "prop";
}

function scanFile(file: string): Hit[] {
  const hits: Hit[] = [];
  const lines = readFileSync(file, "utf8").split("\n");

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

    // JSX text between tags: >Some text<
    for (const match of line.matchAll(/>([^<>{}\n]+)</g)) {
      const text = match[1];
      if (looksLikeProse(text)) {
        hits.push({ file, line: i + 1, text: text.trim(), kind: "jsx-text" });
      }
    }

    // User-facing props with a literal value.
    for (const prop of USER_FACING_PROPS) {
      const re = new RegExp(`${prop}=\\{?"([^"]+)"`, "g");
      for (const match of line.matchAll(re)) {
        if (looksLikeProse(match[1])) {
          hits.push({ file, line: i + 1, text: match[1], kind: "prop" });
        }
      }
    }
  });

  return hits;
}

function main() {
  const pathArg = process.argv.indexOf("--path");
  const target = pathArg > -1 ? process.argv[pathArg + 1] : "src";

  const files = collectFiles(join(ROOT, target));
  const byFile = new Map<string, Hit[]>();

  for (const file of files) {
    const hits = scanFile(file);
    if (hits.length > 0) byFile.set(file, hits);
  }

  let total = 0;
  const ordered = [...byFile.entries()].sort(
    (a, b) => b[1].length - a[1].length
  );

  for (const [file, hits] of ordered) {
    console.log(`\n${relative(ROOT, file)}  (${hits.length})`);
    for (const hit of hits) {
      console.log(`  ${hit.line}: ${hit.text}`);
    }
    total += hits.length;
  }

  console.log(`\n${total} untranslated user-visible strings in ${byFile.size} files.`);
}

main();
