import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkflow } from "@/lib/agents/workflows";

/**
 * The continuity workflow is "check-continuity". Four places used
 * "continuity-check", an id no workflow has: the book-health alert for a stale
 * chapter offered a button that launched nothing, the cost estimate for the
 * most expensive run (100k-400k tokens) was never found, the report parser's
 * branch never ran, and the suggested next step after a check was empty.
 */

const files = [
  "src/lib/agents/book-health.ts",
  "src/lib/agents/post-session.ts",
  "src/lib/llm/cost-estimator.ts",
  "src/lib/parsers/index.ts",
];

describe("the continuity workflow is named the way the registry names it", () => {
  it("exists under check-continuity, and not under continuity-check", () => {
    expect(getWorkflow("check-continuity")).toBeDefined();
    expect(getWorkflow("continuity-check")).toBeUndefined();
  });

  for (const f of files) {
    it(`${f} uses the registered id`, () => {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src).not.toContain('"continuity-check"');
      expect(src).toContain('"check-continuity"');
    });
  }

  it("every workflow a book-health alert offers is one that exists", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/agents/book-health.ts"), "utf8");
    const offered = [...src.matchAll(/actionWorkflow:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(offered.length).toBeGreaterThan(0);
    for (const id of offered) expect(getWorkflow(id), id).toBeDefined();
  });
});
