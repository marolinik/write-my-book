/**
 * P4-18 / P4-19 — the two lies left on the public pages.
 *
 * **The dash artifacts.** A sweep that removed em-dashes from the landing copy
 * left the spaces behind, so five sentences shipped as "You stay in control .
 * Every major change needs your approval" and "revision , the same process
 * traditional publishers use". This is the first paragraph a stranger reads
 * about a product for writers.
 *
 * **The decorative buttons.** `/demo` renders six `<button>` elements styled
 * in the primary colour, underlined on hover, each with an arrow and a label
 * like "Run Dev Edit". Not one has a handler. The page already carries two
 * real signup links, so these were affordances that promised a product demo
 * and did nothing at all.
 *
 * Both guards are mechanical, because both defects came back after being
 * fixed once (D-182 was reintroduced by a later prose commit).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "..", "src");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf-8");

/** Every file whose copy a signed-out visitor reads. */
function marketingFiles(): Array<{ name: string; text: string }> {
  const files: Array<{ name: string; text: string }> = [
    { name: "app/page.tsx", text: read("app", "page.tsx") },
    { name: "app/demo/page.tsx", text: read("app", "demo", "page.tsx") },
  ];
  for (const entry of readdirSync(join(SRC, "components", "landing"))) {
    if (entry.endsWith(".tsx")) {
      files.push({
        name: `components/landing/${entry}`,
        text: read("components", "landing", entry),
      });
    }
  }
  return files;
}

describe("the copy a stranger reads first", () => {
  it("carries no orphaned punctuation from the em-dash sweep", () => {
    const offenders: string[] = [];
    for (const { name, text } of marketingFiles()) {
      // A space before a full stop or comma inside a quoted string is never
      // intentional English.
      for (const match of text.matchAll(/"[^"\n]*\s[.,]\s[^"\n]*"/g)) {
        offenders.push(`${name}: ${match[0].slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the demo page", () => {
  const demo = read("app", "demo", "page.tsx");

  it("has no button that does nothing when pressed", () => {
    const buttons = [...demo.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
    const inert = buttons.filter((tag) => !tag.includes("onClick"));
    expect(inert).toEqual([]);
  });

  it("still sends the visitor somewhere real", () => {
    expect(demo).toContain('href="/signup"');
  });
});
