import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The server gate and the next-step suggestion for a per-chapter plan.
 *
 * Review of the CHAPTER_PLAN contract (2026-10-12): the wiring that hands the
 * chosen chapter's documents to the prerequisite check was untested, and a
 * plan-chapter run whose plan was recovered (unreviewed, so not yet counted)
 * answered "write-chapter is blocked — run plan-chapter", i.e. suggested
 * running itself again.
 */

const h = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { document: { findMany: h.findMany } } }));

import { validatePrerequisites } from "@/lib/agents/prerequisites";
import { filterBlockedNextSteps } from "@/lib/agents/artifact-contract";

beforeEach(() => {
  vi.clearAllMocks();
  // The book has a fingerprint and a plan for chapter 1 only.
  h.findMany.mockResolvedValue([
    { type: "FINGERPRINT", chapterNumber: null },
    { type: "CHAPTER_PLAN", chapterNumber: 1 },
    { type: "CHAPTER_CONTENT", chapterNumber: 1 },
    { type: "CHAPTER_CONTENT", chapterNumber: 5 },
  ]);
});

describe("validatePrerequisites for write-chapter", () => {
  it("lets chapter 1 through on its own plan", async () => {
    const res = await validatePrerequisites("write-chapter", "b1", 1);
    expect(res.missing.map((m) => m.value)).not.toContain("CHAPTER_PLAN");
  });

  it("blocks chapter 5, whose plan does not exist, despite chapter 1's plan", async () => {
    const res = await validatePrerequisites("write-chapter", "b1", 5);
    expect(res.satisfied).toBe(false);
    expect(res.missing.map((m) => m.value)).toContain("CHAPTER_PLAN");
  });
});

describe("filterBlockedNextSteps", () => {
  const blockedOnPlan = async () => ({
    satisfied: false,
    missing: [{ description: "plan", type: "document", value: "CHAPTER_PLAN", satisfiedBy: "plan-chapter" }],
  });

  it("does not suggest re-running the workflow that just ran", async () => {
    const out = await filterBlockedNextSteps(["write-chapter"], blockedOnPlan, "plan-chapter");
    expect(out).toEqual([]);
  });

  it("still swaps a blocked step for its unblocker after another workflow", async () => {
    const out = await filterBlockedNextSteps(["write-chapter"], blockedOnPlan, "build-architecture");
    expect(out).toEqual(["plan-chapter"]);
  });
});
