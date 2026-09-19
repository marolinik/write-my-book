/**
 * C3 — a chapter-scoped workflow must never start book-wide.
 *
 * `prerequisites.ts` answered "satisfied" for a chapter_content requirement
 * whenever chapterNumber was undefined ("No chapter specified — skip"), and the
 * one-click starts — the ProactiveGuide CTA, the suggestedNext chips, the
 * journey banner — all called the API with no chapter. The worst case was the
 * `beta-read -> revise` chip: a full-chapter ghostwriter rewrite with
 * `chapterNumber: undefined` and the content gate skipped. Prose has been
 * destroyed twice on this project by a scope that was not what it looked like.
 *
 * The refusal is now the contract: a workflow that requires a chapter and was
 * given none is unsatisfied, with a `chapter_scope` requirement the client can
 * name in the writer's language.
 */

import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: { document: { findMany: vi.fn(async () => [] as Array<{ type: string; chapterNumber: number | null }>) } },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { validatePrerequisites } from "@/lib/agents/prerequisites";
import { getAllWorkflows, getWorkflow } from "@/lib/agents/workflows";

describe("chapter-scoped workflows refuse an unscoped start", () => {
  it("refuses revise with no chapter, and says why", async () => {
    const result = await validatePrerequisites("revise", "book-1");
    expect(result.satisfied).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].type).toBe("chapter_scope");
    expect(result.missing[0].value).toBe("revise");
  });

  it("refuses every requiresChapter workflow the same way", async () => {
    const scoped = getAllWorkflows().filter((w) => w.requiresChapter);
    expect(scoped.length).toBeGreaterThan(0);
    for (const wf of scoped) {
      const result = await validatePrerequisites(wf.id, "book-1");
      expect(result.satisfied, `${wf.id} started book-wide`).toBe(false);
      expect(result.missing[0].type).toBe("chapter_scope");
    }
  });

  it("does not refuse a book-level workflow", async () => {
    const wf = getWorkflow("publishing-check");
    expect(wf?.requiresChapter).toBe(false);
    const result = await validatePrerequisites("publishing-check", "book-1");
    expect(result.missing.some((m) => m.type === "chapter_scope")).toBe(false);
  });
});
