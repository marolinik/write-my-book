/**
 * D3 — the generation the writer paid for and never received.
 *
 * The discuss route is scrupulous about the *turn*: when a settle races the
 * cap, or the writer cancels mid-wait, nothing is persisted, nothing is
 * consumed, the thread stays virgin. Its own comment names what is left over:
 *
 *   "The provider was paid for the generation either way, which is exactly
 *    why the cancel copy makes no billing claim."
 *
 * So the writer's provider bill contains a charge the product has no record
 * of. Saying nothing is defensible only until they compare the two numbers,
 * and then the product looks like it is hiding something it merely never
 * wrote down.
 *
 * The fix is a single boolean. A discarded generation is recorded like any
 * other — same table, same cost, same model — and marked `billed: false`.
 * Quota, spend panels and the cost calibration read only billed rows, so
 * nothing the writer is charged for changes. One disclosure line adds up the
 * rest and says it out loud.
 *
 * The risk this guards against is the one this codebase keeps paying for: a
 * filter that must be repeated at every call site, and the one place that
 * forgets it silently charges the writer for work they never saw.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BILLED_ONLY, isBilledUsage } from "@/lib/billing/billed-usage";

const ROOT = join(__dirname, "..", "..");

/** Every source file, so a new reader cannot hide in a directory nobody listed. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

describe("the billed-only filter", () => {
  it("is what it says it is", () => {
    expect(BILLED_ONLY).toEqual({ billed: true });
    expect(isBilledUsage({ billed: true })).toBe(true);
    expect(isBilledUsage({ billed: false })).toBe(false);
  });
});

describe("every place that reads usage", () => {
  // `create` writes a row and `count` of discarded rows is the disclosure
  // itself; everything else is money the writer is told they spent.
  const READ_CALLS = /usageRecord\.(findMany|groupBy|aggregate)\(/g;

  /**
   * The filter has to be inside the call, not merely somewhere in the file.
   * An earlier version of this guard accepted the import line, so deleting the
   * spread from the query still passed — a guard that cannot fail is not one.
   */
  const CALL_WINDOW = 600;

  it("asks only for rows the writer was actually billed for", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf-8");
      for (const match of text.matchAll(READ_CALLS)) {
        const body = text.slice(match.index, match.index + CALL_WINDOW);
        if (!body.includes("BILLED_ONLY") && !/\bbilled:/.test(body)) {
          offenders.push(
            `${file.slice(ROOT.length + 1).replace(/\\/g, "/")}: ${match[1]}`
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the discuss route", () => {
  const route = readFileSync(
    join(
      ROOT,
      "src",
      "app",
      "api",
      "books",
      "[id]",
      "editorial",
      "findings",
      "[findingId]",
      "discuss",
      "route.ts"
    ),
    "utf-8"
  );

  it("marks the generation it throws away as unbilled", () => {
    expect(route).toContain("markGenerationDiscarded");
  });
});

describe("the disclosure", () => {
  it("is offered to the writer in every language, never in bare English", () => {
    const strings = readFileSync(
      join(ROOT, "src", "lib", "i18n", "ui-strings", "types.ts"),
      "utf-8"
    );
    expect(strings).toContain("discardedGenerations");

    for (const lang of ["en", "sr", "de", "es", "fr", "ru", "zh"]) {
      const file = readFileSync(
        join(ROOT, "src", "lib", "i18n", "ui-strings", `${lang}.ts`),
        "utf-8"
      );
      expect(file, lang).toContain("discardedGenerations");
    }
  });
});
