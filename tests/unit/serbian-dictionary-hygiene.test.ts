/**
 * M-1 / M-8 — the Serbian the product itself writes.
 *
 * Two invisible Cyrillic homoglyphs sat in the Serbian dictionary
 * ("Jezičke preferencе" with a U+0435, "proveravаč" with a U+0430): they render
 * identically and corrupt search, sort and diff. And the dialect block in the
 * agent prompt gave the model its "correct" Serbian column with the diacritics
 * stripped — tacno, pozoriste, opste — two lines after insisting on č, ć, š, ž,
 * đ. Both are the kind of thing only a machine notices.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");
const CYRILLIC = /[Ѐ-ӿ]/;

/** The SR dictionary literal, up to the next language literal. */
function serbianBlock(body: string): string {
  const at = body.search(/^const SR/m);
  expect(at, "no SR dictionary found").toBeGreaterThan(-1);
  const rest = body.slice(at);
  const end = rest.slice(1).search(/^const [A-Z]{2}/m);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

describe("the Serbian UI dictionary is Latin", () => {
  it("carries no Cyrillic character at all", () => {
    const block = serbianBlock(src("lib", "i18n", "ui-strings.ts"));
    const offenders = block
      .split("\n")
      .filter((l) => CYRILLIC.test(l))
      .map((l) => l.trim());
    expect(offenders).toEqual([]);
  });

  it("holds no Croatian ijekavian form", () => {
    const block = serbianBlock(src("lib", "i18n", "agent-strings.ts"));
    // The forms that actually appeared, not a general -ije- rule: "Osvježi"
    // shipped in the Serbian workflow menu.
    expect(block).not.toMatch(/Osvje[žz]i|vrijeme|gdje|uvijek|poslije|lijep/i);
  });
});

describe("the dialect block spells its own Serbian correctly", () => {
  const prompt = src("lib", "agents", "prompt-assembler.ts");
  // The prompt text only — the comment above it names the old spellings on
  // purpose, to say what was wrong.
  const block = prompt
    .slice(prompt.indexOf("DIALECT REQUIREMENT"), prompt.indexOf("moram uraditi"))
    .replace(/^\s*\/\/.*$/gm, "");

  it("names the words with their diacritics", () => {
    for (const word of ["tačno", "pozorište", "opšte", "tisuća"]) {
      expect(block, `${word} lost its diacritics`).toContain(word);
    }
  });

  it("does not teach the stripped forms", () => {
    for (const bad of ["tacno ", "pozoriste ", "opste ", "tisuca"]) {
      expect(block).not.toContain(bad);
    }
  });
});
