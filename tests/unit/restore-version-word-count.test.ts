import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P5-S13 (second half) — restoring a chapter version put the old text back
 * but left `chapters.word_count` and `books.word_count` at the replaced
 * version's size: a 300-word chapter restored to its 30-word v1 still read
 * 300 in the chapter list and the book total, and the content GET reported
 * 300 words over 30 words of markdown, until the next typed save.
 *
 * Every other CHAPTER_CONTENT writer keeps those counters honest (the
 * content PUT, the documents PATCH, find & replace — D-200); restore must too.
 */

const h = vi.hoisted(() => {
  const restoreVersion = vi.fn();
  class DocumentServiceStub {
    restoreVersion = restoreVersion;
  }
  return {
    DocumentServiceStub,
    restoreVersion,
    requireUser: vi.fn(),
    reconcileBookCounters: vi.fn(),
    db: {
      book: { findFirst: vi.fn() },
      document: { findFirst: vi.fn() },
      chapter: { updateMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents", () => ({ DocumentService: h.DocumentServiceStub }));
vi.mock("@/lib/books/book-counters", () => ({
  reconcileBookCounters: (...a: unknown[]) => h.reconcileBookCounters(...a),
}));

import { POST } from "@/app/api/books/[id]/documents/[docId]/restore/route";

function restore(version: number) {
  return new Request("http://t/api/books/b1/documents/doc1/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version }),
  }) as unknown as import("next/server").NextRequest;
}

const ctx = { params: Promise.resolve({ id: "b1", docId: "doc1" }) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.chapter.updateMany.mockResolvedValue({ count: 1 });
  h.reconcileBookCounters.mockResolvedValue({ chapterCount: 2, wordCount: 70 });
  h.restoreVersion.mockResolvedValue({
    document: { id: "doc1", currentVersion: 3 },
    version: { version: 3, wordCount: 30, changeType: "revision" },
  });
});

describe("POST /documents/:docId/restore — word counts follow the restored text", () => {
  it("sets the chapter's word count to the restored version's and reconciles the book", async () => {
    h.db.document.findFirst.mockResolvedValue({
      id: "doc1",
      bookId: "b1",
      type: "CHAPTER_CONTENT",
      chapterNumber: 3,
    });

    const res = await POST(restore(1), ctx);

    expect(res.status).toBe(200);
    expect(h.restoreVersion).toHaveBeenCalledWith("doc1", 1);
    expect(h.db.chapter.updateMany).toHaveBeenCalledWith({
      where: { bookId: "b1", chapterNumber: 3 },
      data: { wordCount: 30 },
    });
    expect(h.reconcileBookCounters).toHaveBeenCalledWith("b1");
  });

  it("leaves chapter counters alone when the restored document is not chapter text", async () => {
    h.db.document.findFirst.mockResolvedValue({
      id: "doc1",
      bookId: "b1",
      type: "STORY_BIBLE",
      chapterNumber: null,
    });

    const res = await POST(restore(1), ctx);

    expect(res.status).toBe(200);
    expect(h.db.chapter.updateMany).not.toHaveBeenCalled();
    expect(h.reconcileBookCounters).not.toHaveBeenCalled();
  });
});
