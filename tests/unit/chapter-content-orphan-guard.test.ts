import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-190 / D-115 — the browser variant of deleted-chapter resurrection, driven
 * through the routes the editor actually calls.
 *
 * Captured, end to end, on one book: DELETE chapter 2 → 200; /chapters/new
 * defaults to the freed number 2; the new chapter opens showing the deleted
 * prose (sentinel `GHOST_SECRET_9f3a`) under a "Fresh Start" badge with
 * wordCount 0 over a 106-char body; one typed sentence autosaves 200 and the
 * deleted words become version history of a brand-new chapter. The registered
 * API repro instead ends in a phantom 409 whose `serverContent` leaks the same
 * deleted text.
 *
 * Contract locked here (no schema change, no migration — existing orphan rows
 * stay a founder call):
 *   - GET  content: an orphaned document is not served, and neither is its
 *                   version stamp or id → the editor starts genuinely empty
 *   - PUT  content: the first save RECLAIMS that row (no CAS stamp demanded, so
 *                   no phantom 409 and no leak) and writes only the new text
 *   - a real chapter's document is untouched by both paths
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

import {
  GET,
  PUT,
} from "@/app/api/books/[id]/chapters/[chapterId]/content/route";

const ctx = { params: Promise.resolve({ id: "b1", chapterId: "ch-new" }) };

const CHAPTER_CREATED = new Date("2026-07-02T09:00:00Z");
const DOC_CREATED_EARLIER = new Date("2026-07-01T11:00:00Z");
const DOC_CREATED_LATER = new Date("2026-07-02T09:30:00Z");
const GHOST = "The bell rang twice. GHOST_SECRET_9f3a";

function put(body: unknown) {
  return new Request("http://t/api/books/b1/chapters/ch-new/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}
function get() {
  return new Request("http://t/api/books/b1/chapters/ch-new/content") as unknown as
    import("next/server").NextRequest;
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
  // Brand-new chapter that inherited the freed number 2.
  h.db.chapter.findFirst.mockResolvedValue({
    id: "ch-new",
    chapterNumber: 2,
    title: null,
    actNumber: 1,
    wordCount: 0,
    createdAt: CHAPTER_CREATED,
  });
  h.db.chapter.update.mockResolvedValue({});
  h.db.book.update.mockResolvedValue({});
  h.onDocumentChanged.mockResolvedValue(undefined);
  h.canIndexProseForUser.mockResolvedValue(false);
});

/** The deleted chapter's surviving CHAPTER_CONTENT row. */
function orphanDoc() {
  h.findByType.mockResolvedValue({
    id: "doc-orphan",
    currentVersion: 2,
    createdAt: DOC_CREATED_EARLIER,
  });
  h.readPinned.mockResolvedValue({
    document: { currentVersion: 2 },
    content: GHOST,
  });
}

describe("D-190: GET content refuses to serve a deleted chapter's prose", () => {
  it("returns an empty chapter with no version stamp and no leak", async () => {
    orphanDoc();

    const res = await GET(get(), ctx);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.markdown).toBe("");
    expect(json.wordCount).toBe(0);
    expect(JSON.stringify(json)).not.toContain("GHOST_SECRET_9f3a");
    // No id/version either: the editor must not be able to stamp a save
    // against the orphan and must not offer its history as this chapter's.
    expect(json.documentId).toBeUndefined();
    expect(json.version).toBeUndefined();
  });

  it("REGRESSION: a chapter's own document is still served", async () => {
    h.findByType.mockResolvedValue({
      id: "doc-mine",
      currentVersion: 3,
      createdAt: DOC_CREATED_LATER,
    });
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 3 },
      content: "My own words.",
    });
    h.db.chapter.findFirst.mockResolvedValue({
      id: "ch-new",
      chapterNumber: 2,
      title: null,
      actNumber: 1,
      wordCount: 3,
      createdAt: CHAPTER_CREATED,
    });

    const res = await GET(get(), ctx);
    const json = await res.json();

    expect(json.markdown).toBe("My own words.");
    expect(json.documentId).toBe("doc-mine");
    expect(json.version).toBe(3);
  });
});

describe("D-190: PUT content reclaims the orphan instead of merging into it", () => {
  it("first save writes only the new text, with no CAS demand and no 409", async () => {
    orphanDoc();
    h.update.mockResolvedValue({
      document: { id: "doc-orphan", currentVersion: 3 },
      version: { version: 3 },
    });

    const res = await PUT(put({ markdown: "A new first sentence." }), ctx);
    const json = await res.json();

    // Pre-fix this path returned the phantom 409 with serverContent leaking the
    // deleted prose (registered repro), or silently adopted it.
    expect(res.status).toBe(200);
    expect(json.version).toBe(3);
    expect(h.update).toHaveBeenCalledTimes(1);
    const call = h.update.mock.calls[0];
    expect(call[0]).toBe("doc-orphan");
    expect(call[1]).toBe("A new first sentence.");
    // No optimistic-lock stamp forwarded (this is a genuine first save)…
    expect(call[5]).toBeUndefined();
    // …and the reclaim is labelled so version history can show the boundary
    // between the deleted chapter's versions and this chapter's.
    expect(call[4]).toBe("orphan-reclaim");
  });

  it("REGRESSION: stampless overwrite of a real document still 409s (D-47)", async () => {
    h.findByType.mockResolvedValue({
      id: "doc-mine",
      currentVersion: 7,
      createdAt: DOC_CREATED_LATER,
    });
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 7 },
      content: "the real manuscript",
    });

    const res = await PUT(put({ markdown: "clobber" }), ctx);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("version_conflict");
    expect(h.update).not.toHaveBeenCalled();
  });
});
