/**
 * D-201 — a document recovered from a transcript does not satisfy a setup gate
 * until a human has looked at it.
 *
 * The artifact contract recovers a run's deliverable from the assistant's final
 * text when the run produced no document of its own. That is the right instinct
 * — a lost Story Bible is worse than a synthesised one — but `looksLikeDeliverable`
 * cannot tell a Story Bible from the coach's *interview* turn, the one that asks
 * the writer twelve questions about their world. Recovered, that turn becomes a
 * STORY_BIBLE document, and every gate in the product tests existence only:
 *
 *   hasStoryBible: docTypes.has("STORY_BIBLE")
 *
 * So the wizard advanced, the setup guard opened, and downstream agents ran
 * against a list of questions they took for canon.
 *
 * No column was needed to fix it. A recovered document already carries its own
 * evidence: version 1 of it is stamped `change_source = "transcript-recovery"`.
 * "Nobody has reviewed it" is therefore exactly "it is still on version 1 and
 * that version is a recovery" — and the moment the writer opens the document
 * and saves, version 2 exists and the gate opens by itself.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  db: {
    document: { findMany: vi.fn(async () => [] as Array<{ type: string; chapterNumber: number | null }>) },
    chapter: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    editFinding: { findMany: vi.fn(async () => []) },
    bookInsight: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));

import {
  TRANSCRIPT_RECOVERY_SOURCE,
  NOT_AWAITING_REVIEW,
  isAwaitingReview,
  setupDocumentTypes,
} from "@/lib/documents/review-gate";

const recoveredV1 = {
  currentVersion: 1,
  versions: [{ changeSource: TRANSCRIPT_RECOVERY_SOURCE }],
};

describe("a document still awaiting review", () => {
  it("is one the transcript recovered and nobody has saved since", () => {
    expect(isAwaitingReview(recoveredV1)).toBe(true);
  });

  it("stops awaiting review the moment a second version exists", () => {
    expect(
      isAwaitingReview({
        currentVersion: 2,
        versions: [{ changeSource: TRANSCRIPT_RECOVERY_SOURCE }, { changeSource: "user" }],
      })
    ).toBe(false);
  });

  it("was never awaiting review when an agent wrote it on purpose", () => {
    expect(isAwaitingReview({ currentVersion: 1, versions: [{ changeSource: "session-abc" }] })).toBe(
      false
    );
  });
});

describe("the setup gate", () => {
  beforeEach(() => {
    h.db.document.findMany.mockClear();
  });

  it("asks the database not to count a document awaiting review", async () => {
    await setupDocumentTypes("book-1");
    const call = h.db.document.findMany.mock.calls[0] as unknown as [{ where: unknown }];
    const where = call?.[0]?.where;
    expect(where).toMatchObject(NOT_AWAITING_REVIEW);
  });

  it("excludes exactly the recovered-and-untouched shape, not every first version", () => {
    // A NOT that dropped `currentVersion` would hide a Story Bible the writer
    // has since edited; one that dropped the source would hide every document
    // on its first version, which is most of them.
    expect(NOT_AWAITING_REVIEW.NOT.currentVersion).toBe(1);
    expect(NOT_AWAITING_REVIEW.NOT.versions.some.changeSource).toBe(TRANSCRIPT_RECOVERY_SOURCE);
  });

  it("reports the types that are actually allowed to count", async () => {
    h.db.document.findMany.mockResolvedValueOnce([
      { type: "STORY_BIBLE", chapterNumber: null },
      { type: "ARCHITECTURE", chapterNumber: null },
    ]);
    const types = await setupDocumentTypes("book-1");
    expect(types.has("STORY_BIBLE")).toBe(true);
    expect(types.has("FINGERPRINT")).toBe(false);
  });
});

describe("every gate that counts documents", () => {
  beforeEach(() => {
    h.db.document.findMany.mockClear();
  });

  /** The `where` of the document query a gate just ran. */
  function whereOfDocumentQuery(): unknown {
    const call = h.db.document.findMany.mock.calls[0] as unknown as [{ where: unknown }];
    return call?.[0]?.where;
  }

  it("refuses the recovered document when a workflow checks its prerequisites", async () => {
    const { validatePrerequisites } = await import("@/lib/agents/prerequisites");
    await validatePrerequisites("dev-edit", "book-1", 1);
    expect(whereOfDocumentQuery()).toMatchObject(NOT_AWAITING_REVIEW);
  });

  it("refuses it when book health decides whether a Story Bible exists", async () => {
    const { computeBookHealth } = await import("@/lib/agents/book-health");
    await computeBookHealth("book-1").catch(() => undefined);
    expect(whereOfDocumentQuery()).toMatchObject(NOT_AWAITING_REVIEW);
  });

  it("refuses it in the setup guard on the agent route", () => {
    // The route is a Next handler with auth and billing ahead of the guard, so
    // the contract here is over the query the guard is written to run.
    const route = readFileSync(
      join(__dirname, "..", "..", "src", "app", "api", "books", "[id]", "agent", "route.ts"),
      "utf-8"
    );
    const guard = route.indexOf("Setup Completeness Guard");
    expect(guard).toBeGreaterThan(0);
    expect(route.indexOf("...NOT_AWAITING_REVIEW")).toBeGreaterThan(guard);
  });
});
