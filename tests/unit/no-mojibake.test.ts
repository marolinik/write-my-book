/**
 * Guard against double-encoded text re-entering the source tree.
 *
 * `ui-strings.ts` shipped 51 runs of it: Serbian, German and Spanish UI strings
 * had been decoded as Latin-1 once and re-saved as UTF-8, so "c with caron" was
 * stored as "A-diaeresis" + U+008D and rendered as garbage in the setup wizard.
 * The bytes of the original are still there, which is exactly why this is
 * detectable: a run of codepoints in U+0080..U+00FF that decodes cleanly as
 * UTF-8 is mojibake, not legitimate Latin-1 text (a lone "e-acute" or
 * "u-diaeresis" is not valid UTF-8 on its own).
 *
 * One shape collides with a legitimate one and cannot be told apart: French
 * spacing before a closing guillemet. "passe-acute" + NO-BREAK SPACE + "»" is
 * E9 A0 BB, which decodes cleanly, and the mojibake of "a-grave" really is
 * "A-tilde" + NO-BREAK SPACE — so exempting the no-break space would blind
 * this test to a real case. French therefore uses U+202F NARROW NO-BREAK
 * SPACE before « » ? ! ; :, which is the character French typography calls
 * for anyway and is outside the Latin-1 range this scan reads.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["generated", "node_modules", ".next"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Runs of Latin-1-range codepoints that decode as valid UTF-8 = mojibake. */
function findMojibake(text: string): string[] {
  const hits: string[] = [];
  for (const match of text.matchAll(/[-ÿ]+/g)) {
    const run = match[0];
    const bytes = Uint8Array.from([...run].map((c) => c.charCodeAt(0)));
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded !== run) hits.push(`${run} -> ${decoded}`);
    } catch {
      // Not valid UTF-8 - genuine Latin-1 text, leave it alone.
    }
  }
  return hits;
}

describe("source files carry no double-encoded text", () => {
  // This test walks every file under src/ and decodes each one. Under full-suite
  // load that runs past the 5s default while collection is still churning
  // through 265 files, and it has flaked on exactly that for two sessions; it
  // passes in isolation every time. The work is filesystem-bound, so the honest
  // fix is a timeout that matches the work.
  it("finds none under src/", { timeout: 30_000 }, () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const hits = findMojibake(readFileSync(file, "utf-8"));
      if (hits.length > 0) {
        offenders.push(`${file}: ${hits.length} run(s), e.g. ${hits[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detects the pattern it is meant to catch", () => {
    // "c with caron" (C4 8D) stored as two Latin-1 codepoints - the exact shape
    // that was in ui-strings.ts.
    expect(findMojibake("priÄe")).toHaveLength(1);
    // Real Latin-1 text must not be flagged.
    expect(findMojibake("français, schön, niño")).toEqual([]);
  });
});
