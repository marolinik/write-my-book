/**
 * D5 — the batch history has a reader.
 *
 * `GET /api/books/[id]/batch` returns the last twenty whole-book runs, and
 * `deriveLiveBatchFields` corrects the stored counters of every non-terminal
 * row so the numbers are honest while a run is still going (D-120). All of
 * that was built, tested and shipped, and **nothing in the product ever called
 * it.** The only client of that path was the POST that starts a run.
 *
 * A writer who started an overnight batch could see it while the dialog was
 * open and never again: no history, no record of what a finished run cost, no
 * way to see why one halted. The work was done; the surface was missing.
 *
 * This is the contract that keeps it connected. It is deliberately about the
 * wiring rather than the pixels: the hook must ask for the list route, and the
 * editorial page must render the panel that uses it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the batch list route", () => {
  it("is read by a hook, not only written to", () => {
    const hook = src("hooks", "use-batch-history.ts");
    expect(hook).toContain("/batch");
    expect(hook).toMatch(/useQuery/);
  });

  it("asks for the live-corrected fields the route already computes", () => {
    const hook = src("hooks", "use-batch-history.ts");
    // The route returns `{ batches: [...] }` with spend, counts and halt state
    // already corrected per row. The hook must not recompute them.
    expect(hook).toContain("batches");
    // Naming it in a comment is the point; importing it would mean the client
    // had grown a second answer to "how far along is this run".
    expect(hook).not.toMatch(/import[^;]*deriveLiveBatchFields/);
  });
});

describe("the editorial page", () => {
  it("renders the batch history", () => {
    const page = src("components", "editorial", "editorial-page.tsx");
    expect(page).toContain("BatchHistory");
  });
});

describe("the batch history panel", () => {
  const panel = src("components", "editorial", "batch-history.tsx");

  it("answers in the writer's language, never in hardcoded English", () => {
    expect(panel).toContain("useLanguage");
    // Any bare double-quoted sentence in JSX text is the failure this repo has
    // spent four sessions removing.
    const jsxText = [...panel.matchAll(/>\s*([A-Z][a-z]+ [a-z][^<>{}]{8,})\s*</g)].map((m) => m[1]);
    expect(jsxText).toEqual([]);
  });

  it("has a loading, an empty and an error state, not just the happy one", () => {
    expect(panel).toMatch(/isLoading/);
    expect(panel).toMatch(/isError/);
    expect(panel).toMatch(/length === 0/);
  });

  it("shows what a run cost against what it was allowed to cost", () => {
    expect(panel).toContain("spentUsd");
    expect(panel).toContain("budgetCapUsd");
  });

  it("says why a run halted, because a halted run that does not say why is a bug report", () => {
    expect(panel).toContain("haltReason");
  });
});
