import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-16: duplicate Document rows for one chapter → silent lost-update.
 *
 * Live-proven: two documents rows with the same (bookId, type=CHAPTER_CONTENT,
 * chapter_number), same storage_key, independent current_version — GET and PUT
 * landed on different rows nondeterministically, so the CAS 409 could never
 * fire across rows. Three seams are pinned here:
 *
 *   (a) content-route PUT: the first-save find-or-create is race-guarded —
 *       a P2002 unique violation on create falls back to the normal
 *       existing-doc update path (incl. CAS 409), converging on ONE row;
 *   (b) DocumentService.findByType reads deterministically (oldest row wins)
 *       for any legacy duplicates in other deployments;
 *   (c) repair-script planning: keep the OLDEST row, lift its currentVersion
 *       to the group MAX, re-parent dependent DocumentVersion rows (renumbering
 *       collisions past the group max), delete the extras.
 */

const h = vi.hoisted(() => {
  class VersionConflictError extends Error {
    documentId: string;
    constructor(documentId: string) {
      super("version_conflict");
      this.documentId = documentId;
      this.name = "VersionConflictError";
    }
  }
  return {
    user: { id: "u1" },
    requireUser: vi.fn(),
    db: {
      book: { findFirst: vi.fn(), update: vi.fn() },
      chapter: { findFirst: vi.fn(), update: vi.fn() },
      document: { findFirst: vi.fn() },
    },
    findByType: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    readPinned: vi.fn(),
    onDocumentChanged: vi.fn(),
    VersionConflictError,
  };
});

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    findByType = h.findByType;
    create = h.create;
    update = h.update;
    readPinned = h.readPinned;
  },
  VersionConflictError: h.VersionConflictError,
}));
vi.mock("@/lib/vector/memory-manager", () => ({
  onDocumentChanged: h.onDocumentChanged,
}));
// (b) uses the REAL DocumentService (mocked db + storage), so only the
// storage factory needs stubbing.
vi.mock("@/lib/storage", () => ({
  getBookStorage: vi.fn(() => ({})),
  getSeriesStorage: vi.fn(() => ({})),
}));

import { PUT } from "@/app/api/books/[id]/chapters/[chapterId]/content/route";
import { DocumentService } from "@/lib/documents/document-service";
import { planDocumentGroupRepair } from "../../scripts/repair-duplicate-documents";

const ctx = { params: Promise.resolve({ id: "b1", chapterId: "ch1" }) };
function put(body: unknown) {
  return new Request("http://t/api/books/b1/chapters/ch1/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // NextRequest is structurally compatible with Request for this route
  }) as unknown as import("next/server").NextRequest;
}

/** Prisma unique-violation shape (P2002) as thrown by document.create. */
function p2002() {
  const err = new Error("Unique constraint failed") as Error & { code: string };
  err.code = "P2002";
  return err;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", wordCount: 0, seriesId: null, language: "en" });
  h.db.chapter.findFirst.mockResolvedValue({
    id: "ch1",
    chapterNumber: 1,
    title: "One",
    actNumber: 1,
    wordCount: 0,
  });
  h.db.chapter.update.mockResolvedValue({});
  h.db.book.update.mockResolvedValue({});
  h.onDocumentChanged.mockResolvedValue(undefined);
});

describe("PUT chapter content: first-save race guard (D-16a)", () => {
  it("P2002 on create → re-fetches the winner row and converges via the update path", async () => {
    // First findByType: no doc yet (both racers see this). Second findByType
    // (after the lost create): the winner's row.
    h.findByType
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "docW", currentVersion: 1 });
    h.create.mockRejectedValue(p2002());
    h.update.mockResolvedValue({
      document: { id: "docW", currentVersion: 2 },
      version: { version: 2 },
    });

    const res = await PUT(put({ markdown: "hello world" }), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.version).toBe(2);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.findByType).toHaveBeenCalledTimes(2);
    // The loser converges on the WINNER's row via the normal update path.
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][0]).toBe("docW");
  });

  it("P2002 fallback still honors the CAS: stale expectedVersion → 409, nothing created", async () => {
    h.findByType
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "docW", currentVersion: 4 });
    h.create.mockRejectedValue(p2002());
    h.update.mockRejectedValue(new h.VersionConflictError("docW"));
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 4 },
      content: "server truth",
    });

    const res = await PUT(put({ markdown: "stale", expectedVersion: 2 }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("version_conflict");
    expect(json.currentVersion).toBe(4);
    expect(json.serverContent).toBe("server truth");
    // CAS stamp threaded through to svc.update on the fallback path too.
    expect(h.update.mock.calls[0][5]).toBe(2);
  });

  it("non-P2002 create errors are not swallowed (500)", async () => {
    h.findByType.mockResolvedValueOnce(null);
    h.create.mockRejectedValue(new Error("storage down"));

    const res = await PUT(put({ markdown: "x" }), ctx);

    expect(res.status).toBe(500);
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe("DocumentService.findByType: deterministic reads (D-16b)", () => {
  it("orders by createdAt asc so the oldest duplicate wins consistently", async () => {
    h.db.document.findFirst.mockResolvedValue({ id: "oldest" });
    const svc = new DocumentService("u1", "b1");

    await svc.findByType("CHAPTER_CONTENT" as never, 1);

    expect(h.db.document.findFirst).toHaveBeenCalledWith({
      where: { type: "CHAPTER_CONTENT", bookId: "b1", chapterNumber: 1 },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("repair script planning (D-16c)", () => {
  const t0 = new Date("2026-07-01T00:00:00Z");
  const t1 = new Date("2026-07-02T00:00:00Z");
  const t2 = new Date("2026-07-03T00:00:00Z");

  it("keeps the oldest row, lifts currentVersion to the group max, deletes the rest", () => {
    const plan = planDocumentGroupRepair(
      [
        { id: "B", currentVersion: 4, createdAt: t1 },
        { id: "A", currentVersion: 3, createdAt: t0 },
      ],
      [
        { id: "vA1", documentId: "A", version: 1 },
        { id: "vA2", documentId: "A", version: 2 },
        { id: "vA3", documentId: "A", version: 3 },
        { id: "vB1", documentId: "B", version: 1 },
        { id: "vB2", documentId: "B", version: 2 },
        { id: "vB3", documentId: "B", version: 3 },
        { id: "vB4", documentId: "B", version: 4 },
      ]
    );

    expect(plan.keepId).toBe("A");
    expect(plan.newCurrentVersion).toBe(4);
    expect(plan.deleteDocumentIds).toEqual(["B"]);
  });

  it("re-parents dependent version rows, renumbering (documentId,version) collisions past the group max", () => {
    const plan = planDocumentGroupRepair(
      [
        { id: "A", currentVersion: 3, createdAt: t0 },
        { id: "B", currentVersion: 4, createdAt: t1 },
      ],
      [
        { id: "vA1", documentId: "A", version: 1 },
        { id: "vA2", documentId: "A", version: 2 },
        { id: "vA3", documentId: "A", version: 3 },
        { id: "vB1", documentId: "B", version: 1 },
        { id: "vB2", documentId: "B", version: 2 },
        { id: "vB3", documentId: "B", version: 3 },
        { id: "vB4", documentId: "B", version: 4 },
      ]
    );

    // B's v4 has no counterpart under A: it keeps its number (and becomes
    // the kept row's currentVersion target). B's v1-v3 collide with A's own
    // v1-v3 and are renumbered sequentially past the group max.
    expect(plan.moves).toEqual([
      { versionRowId: "vB1", fromDocumentId: "B", fromVersion: 1, toVersion: 5 },
      { versionRowId: "vB2", fromDocumentId: "B", fromVersion: 2, toVersion: 6 },
      { versionRowId: "vB3", fromDocumentId: "B", fromVersion: 3, toVersion: 7 },
      { versionRowId: "vB4", fromDocumentId: "B", fromVersion: 4, toVersion: 4 },
    ]);
  });

  it("handles three-way duplicates and extras without version rows", () => {
    const plan = planDocumentGroupRepair(
      [
        { id: "C", currentVersion: 1, createdAt: t2 },
        { id: "A", currentVersion: 2, createdAt: t0 },
        { id: "B", currentVersion: 5, createdAt: t1 },
      ],
      [
        { id: "vA1", documentId: "A", version: 1 },
        { id: "vA2", documentId: "A", version: 2 },
        { id: "vB5", documentId: "B", version: 5 },
      ]
    );

    expect(plan.keepId).toBe("A");
    expect(plan.newCurrentVersion).toBe(5);
    // Extras deleted in createdAt order; C contributes no version moves.
    expect(plan.deleteDocumentIds).toEqual(["B", "C"]);
    expect(plan.moves).toEqual([
      { versionRowId: "vB5", fromDocumentId: "B", fromVersion: 5, toVersion: 5 },
    ]);
  });

  it("ties on createdAt break deterministically by id", () => {
    const plan = planDocumentGroupRepair(
      [
        { id: "Z", currentVersion: 1, createdAt: t0 },
        { id: "A", currentVersion: 1, createdAt: t0 },
      ],
      []
    );
    expect(plan.keepId).toBe("A");
    expect(plan.deleteDocumentIds).toEqual(["Z"]);
  });
});
