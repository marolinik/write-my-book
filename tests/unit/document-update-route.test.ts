import { describe, it, expect, vi, beforeEach } from "vitest";

// S5: non-chapter documents must be optimistically locked (CAS) so a
// concurrent agent WriteDocument can't silently clobber a manual edit.
// Mirrors the chapter-content route's CAS test.
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
      book: { findFirst: vi.fn() },
      document: { findFirst: vi.fn() },
      chapter: { updateMany: vi.fn() },
    },
    update: vi.fn(),
    readPinned: vi.fn(),
    onDocumentChanged: vi.fn(),
    deleteDocumentChunks: vi.fn(),
    VersionConflictError,
  };
});

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    update = h.update;
    readPinned = h.readPinned;
  },
  VersionConflictError: h.VersionConflictError,
}));
vi.mock("@/lib/vector/memory-manager", () => ({
  onDocumentChanged: h.onDocumentChanged,
}));
vi.mock("@/lib/vector", () => ({
  deleteDocumentChunks: h.deleteDocumentChunks,
}));

import { PATCH } from "@/app/api/books/[id]/documents/[docId]/route";

const ctx = { params: Promise.resolve({ id: "b1", docId: "doc1" }) };
function patch(body: unknown) {
  return new Request("http://t/api/books/b1/documents/doc1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // NextRequest is structurally compatible with Request for this route
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.document.findFirst.mockResolvedValue({
    id: "doc1",
    bookId: "b1",
    type: "STORY_BIBLE",
    chapterNumber: null,
    currentVersion: 5,
  });
  h.onDocumentChanged.mockResolvedValue(undefined);
});

describe("PATCH /api/books/:id/documents/:docId (S5 optimistic lock)", () => {
  it("matching expectedVersion → updates and returns the new numeric version", async () => {
    h.update.mockResolvedValue({
      document: { id: "doc1", currentVersion: 6 },
      version: { version: 6 },
    });

    const res = await PATCH(patch({ content: "new text", expectedVersion: 5 }), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.version).toBe(6);
    // The CAS stamp must be threaded to svc.update as its 6th argument.
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][5]).toBe(5);
  });

  it("stale expectedVersion → 409 with serverContent and serverVersion", async () => {
    h.update.mockRejectedValue(new h.VersionConflictError("doc1"));
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 9 },
      content: "server-side truth",
    });

    const res = await PATCH(patch({ content: "my stale edit", expectedVersion: 5 }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("version_conflict");
    expect(json.serverVersion).toBe(9);
    expect(json.serverContent).toBe("server-side truth");
    // Nothing was written on a rejected CAS.
    expect(h.readPinned).toHaveBeenCalledWith("doc1");
  });

  it("absent expectedVersion → still updates (last-write-wins back-compat)", async () => {
    h.update.mockResolvedValue({
      document: { id: "doc1", currentVersion: 6 },
      version: { version: 6 },
    });

    const res = await PATCH(patch({ content: "agent write", changeSource: "manual" }), ctx);

    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
    // No CAS stamp forwarded — the write proceeds unconditionally.
    expect(h.update.mock.calls[0][5]).toBeUndefined();
  });
});
