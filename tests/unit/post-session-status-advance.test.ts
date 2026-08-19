import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-48 (sticky fake status): a GENUINE successful run whose target status
 * EQUALS the chapter's current status must record the pass — it must not
 * silently report statusAdvanced:false and leave the record uncorrectable.
 *
 * Evidence (P6 Owen): after a pre-D-36 provider-failed pass1 fake-advanced
 * chapter 5 to "line_edited", the genuine pass2 (3 real findings, 50508/8507
 * tokens, $0.0348) reported statusAdvanced:false and could not refresh the
 * stage (api-traces/lineedit-ch5-pass2.json). Root cause: advanceChapterStatus
 * returned false whenever targetIdx <= currentIdx, collapsing two distinct
 * cases:
 *   - regress attempt      (target BEHIND current) → must stay false
 *   - idempotent re-advance (target EQUALS current) → a genuine second pass,
 *                                                     must record/refresh
 *
 * The fix narrows the guard to `targetIdx < currentIdx`, so a genuine pass that
 * lands exactly on the current stage re-writes the same status (bumping the
 * chapter's @updatedAt) and returns true, while a genuine pass at an EARLIER
 * stage never pulls a further-along chapter backward.
 */

const h = vi.hoisted(() => {
  const tx = {
    chapter: { findFirst: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    db: {
      // Mirror db.$transaction(fn) → fn(tx): advanceChapterStatus is the whole
      // transaction body, so returning fn(tx) yields its boolean result.
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
// Stub post-session's heavier collaborators so importing the module under test
// never pulls real graph / vector / series clients. advanceChapterStatus needs
// none of them; these keep the unit hermetic and fast.
vi.mock("@/lib/documents/document-service", () => ({ DocumentService: class {} }));
vi.mock("@/lib/parsers", () => ({
  parseAgentOutput: vi.fn(),
  extractNumericScore: vi.fn(),
}));
vi.mock("@/lib/graph/graph-maintenance", () => ({ updateFromChapter: vi.fn() }));
vi.mock("@/lib/agents/extraction-keys", () => ({
  getExtractionKeysForUser: vi.fn(),
}));
vi.mock("@/lib/vector/memory-manager", () => ({
  onSessionCompleted: vi.fn(),
  onDocumentChanged: vi.fn(),
  onFindingsCreated: vi.fn(),
}));
vi.mock("@/lib/agents/blackboard", () => ({ promoteFindings: vi.fn() }));
vi.mock("@/lib/series/series-synthesizer", () => ({ synthesizeToSeries: vi.fn() }));

import { advanceChapterStatus } from "@/lib/agents/post-session";

function chapterAt(status: string) {
  return { id: "ch-id", bookId: "b1", chapterNumber: 5, status };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.tx.chapter.update.mockResolvedValue({});
});

describe("advanceChapterStatus (D-48 idempotent re-advance)", () => {
  it("advances forward and returns true (dev_edited → line_edited)", async () => {
    h.tx.chapter.findFirst.mockResolvedValue(chapterAt("dev_edited"));

    const advanced = await advanceChapterStatus("b1", 5, "line_edited");

    expect(advanced).toBe(true);
    expect(h.tx.chapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ch-id" },
        data: { status: "line_edited" },
      })
    );
  });

  it("D-48: a genuine pass on an already-line_edited chapter records the pass (returns true, refreshes the row)", async () => {
    h.tx.chapter.findFirst.mockResolvedValue(chapterAt("line_edited"));

    const advanced = await advanceChapterStatus("b1", 5, "line_edited");

    // The genuine second pass must be recorded, not silently dropped as
    // statusAdvanced:false (the D-48 sticky-status symptom).
    expect(advanced).toBe(true);
    // Re-writing the same status bumps updatedAt (@updatedAt) — the durable
    // record that a genuine pass reached this stage.
    expect(h.tx.chapter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ch-id" },
        data: { status: "line_edited" },
      })
    );
  });

  it("never regresses a chapter already past the target (beta_passed, target line_edited) → false, no write", async () => {
    h.tx.chapter.findFirst.mockResolvedValue(chapterAt("beta_passed"));

    const advanced = await advanceChapterStatus("b1", 5, "line_edited");

    expect(advanced).toBe(false);
    expect(h.tx.chapter.update).not.toHaveBeenCalled();
  });

  it("a beta-read re-run must not drop a beta_passed chapter back to beta_read → false, no write", async () => {
    h.tx.chapter.findFirst.mockResolvedValue(chapterAt("beta_passed"));

    const advanced = await advanceChapterStatus("b1", 5, "beta_read");

    expect(advanced).toBe(false);
    expect(h.tx.chapter.update).not.toHaveBeenCalled();
  });

  it("multi-step forward advance still works (drafted → line_edited) → true", async () => {
    h.tx.chapter.findFirst.mockResolvedValue(chapterAt("drafted"));

    const advanced = await advanceChapterStatus("b1", 5, "line_edited");

    expect(advanced).toBe(true);
    expect(h.tx.chapter.update).toHaveBeenCalledTimes(1);
  });

  it("returns false when the chapter does not exist", async () => {
    h.tx.chapter.findFirst.mockResolvedValue(null);

    const advanced = await advanceChapterStatus("b1", 5, "line_edited");

    expect(advanced).toBe(false);
    expect(h.tx.chapter.update).not.toHaveBeenCalled();
  });
});
