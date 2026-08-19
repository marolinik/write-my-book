import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-47 — unversioned raw-PUT to chapter content is silent last-write-wins.
 *
 * Judge repro (P7-func J-4): 5 concurrent content PUTs all returned 200, four
 * versions vanished; the 29af79e CAS never fires because it is OPT-IN (only
 * engages when the client stamps `expectedVersion`). A raw client — or a stale
 * browser tab — that omits the stamp silently clobbers a concurrent editor.
 *
 * Contract fixed here (content PUT, existing-doc overwrite only):
 *   - expectedVersion supplied + match  → write + bump   (unchanged)
 *   - expectedVersion supplied + stale  → 409 version_conflict, nothing written
 *   - expectedVersion ABSENT + interactive source ("user"/"manual"/default)
 *       → 409 version_conflict + current server state (NO silent clobber)  [NEW]
 *   - expectedVersion ABSENT + trusted non-interactive writer
 *       (conflict-backup / agent / import / restore / system / migration)
 *       → write proceeds last-write-wins (deliberate bypass)               [KEPT]
 *   - first save (no existing doc, incl. the P2002 create-race convergence)
 *       → no version required                                              [KEPT]
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
    canIndexProseForUser: vi.fn(),
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
vi.mock("@/lib/vector/indexing-gate", () => ({
  canIndexProseForUser: h.canIndexProseForUser,
}));

import { PUT } from "@/app/api/books/[id]/chapters/[chapterId]/content/route";

const ctx = { params: Promise.resolve({ id: "b1", chapterId: "ch1" }) };
function put(body: unknown) {
  return new Request("http://t/api/books/b1/chapters/ch1/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // NextRequest is structurally compatible with Request for this route
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({
    id: "b1",
    wordCount: 0,
    seriesId: null,
    language: "en",
  });
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
  h.canIndexProseForUser.mockResolvedValue(false);
});

describe("D-47: content PUT rejects versionless overwrite of an existing doc", () => {
  it("RED: user-sourced PUT with NO expectedVersion → 409, nothing written (clobber prevented)", async () => {
    // A live document already exists at version 7.
    h.findByType.mockResolvedValue({ id: "docE", currentVersion: 7 });
    // If the guard is absent, the unguarded svc.update SUCCEEDS — i.e. the raw
    // PUT lands the clobber and returns 200 (the exact J-4 silent last-write-
    // wins). The guard must short-circuit BEFORE this ever runs.
    h.update.mockResolvedValue({
      document: { id: "docE", currentVersion: 8 },
      version: { version: 8 },
    });
    // Server truth returned to the client so it can reconcile.
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 7 },
      content: "the real manuscript",
    });

    // Raw PUT: no expectedVersion, no changeSource (defaults to interactive "user").
    const res = await PUT(put({ markdown: "clobbering text" }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("version_conflict");
    expect(json.currentVersion).toBe(7);
    expect(json.serverContent).toBe("the real manuscript");
    // The clobber never reached storage: svc.update must NOT have been called.
    expect(h.update).not.toHaveBeenCalled();
  });

  it("matching expectedVersion → writes and bumps version (200)", async () => {
    h.findByType.mockResolvedValue({ id: "docE", currentVersion: 7 });
    h.update.mockResolvedValue({
      document: { id: "docE", currentVersion: 8 },
      version: { version: 8 },
    });

    const res = await PUT(
      put({ markdown: "a legit stamped edit", expectedVersion: 7 }),
      ctx
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.version).toBe(8);
    // The CAS stamp is threaded through as svc.update's 6th argument.
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][5]).toBe(7);
  });

  it("supplied-but-stale expectedVersion → 409 (pre-existing CAS, not regressed)", async () => {
    h.findByType.mockResolvedValue({ id: "docE", currentVersion: 9 });
    h.update.mockRejectedValue(new h.VersionConflictError("docE"));
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 9 },
      content: "server truth",
    });

    const res = await PUT(
      put({ markdown: "stale edit", expectedVersion: 4 }),
      ctx
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("version_conflict");
    expect(json.currentVersion).toBe(9);
    expect(json.serverContent).toBe("server truth");
    // The CAS was actually attempted with the stale stamp.
    expect(h.update.mock.calls[0][5]).toBe(4);
  });

  it("REGRESSION: conflict-backup versionless write still succeeds (data-loss safety net intact)", async () => {
    // save-conflict-dialog.handleLoadTheirs backs up local words with an
    // intentionally UNGUARDED save (changeSource "conflict-backup", no version)
    // BEFORE the guarded resolve. Rejecting it would destroy unsaved words.
    h.findByType.mockResolvedValue({ id: "docE", currentVersion: 7 });
    h.update.mockResolvedValue({
      document: { id: "docE", currentVersion: 8 },
      version: { version: 8 },
    });

    const res = await PUT(
      put({ markdown: "local words backup", changeSource: "conflict-backup" }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    // No CAS stamp forwarded — the trusted writer keeps last-write-wins.
    expect(h.update.mock.calls[0][5]).toBeUndefined();
  });

  it("REGRESSION: server-side import writer (versionless) still succeeds", async () => {
    h.findByType.mockResolvedValue({ id: "docE", currentVersion: 7 });
    h.update.mockResolvedValue({
      document: { id: "docE", currentVersion: 8 },
      version: { version: 8 },
    });

    const res = await PUT(
      put({ markdown: "imported chapter body", changeSource: "import" }),
      ctx
    );

    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][5]).toBeUndefined();
  });

  it("REGRESSION: first save (no existing doc) needs no version", async () => {
    h.findByType.mockResolvedValue(null);
    h.create.mockResolvedValue({ id: "docNew", currentVersion: 1 });

    const res = await PUT(put({ markdown: "brand new chapter" }), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.version).toBe(1);
    expect(h.create).toHaveBeenCalledTimes(1);
    // No overwrite guard on the create path.
    expect(h.update).not.toHaveBeenCalled();
  });
});
