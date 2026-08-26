import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * D-200 — deleting a chapter never took its words back out of the book total.
 *
 * `books.word_count` had exactly one writer: the delta increment on the
 * chapter-content save path. Nothing ever subtracted, so a deleted chapter's
 * words stayed in the book total permanently — the number could only go up.
 * Measured live (50b): a book whose single surviving chapter held 14 words
 * reported 37, overstated by precisely the 23 words of a chapter deleted three
 * steps earlier.
 *
 * The total is not cosmetic. It feeds Total Words, the novel-equivalent
 * readout, the milestone unlocks (`milestone-rewards.tsx` gates awards on
 * `totalWords >= r.requiresWords`) and the shareable progress card — so the
 * drift hands out achievements the writer never earned and publishes an
 * inflated claim on their behalf.
 *
 * Contract locked here: every path that changes what the chapter rows hold
 * reconciles BOTH denormalised counters from those rows — the D-194
 * authoritative-recount shape, extended to words — so an already-drifted book
 * converges the next time it is touched instead of drifting further.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), update: vi.fn() },
    chapter: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    document: { findFirst: vi.fn() },
  },
  deleteChapterChunks: vi.fn(),
  svcCreate: vi.fn(),
  svcUpdate: vi.fn(),
  svcReadPinned: vi.fn(),
  onDocumentChanged: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector", () => ({
  deleteChapterChunks: (...a: unknown[]) => h.deleteChapterChunks(...a),
  deleteDocumentChunks: vi.fn(),
}));
vi.mock("@/lib/vector/memory-manager", () => ({
  onDocumentChanged: (...a: unknown[]) => h.onDocumentChanged(...a),
}));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    create = h.svcCreate;
    update = h.svcUpdate;
    readPinned = h.svcReadPinned;
  },
  VersionConflictError: class extends Error {},
}));

import { POST as CREATE_CHAPTER } from "@/app/api/books/[id]/chapters/route";
import { DELETE as DELETE_CHAPTER } from "@/app/api/books/[id]/chapters/[chapterId]/route";
import { POST as CREATE_DOCUMENT } from "@/app/api/books/[id]/documents/route";
import { PATCH as UPDATE_DOCUMENT } from "@/app/api/books/[id]/documents/[docId]/route";
import { reconcileBookCounters } from "@/lib/books/book-counters";

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** Last `data` payload passed to db.book.update. */
function lastBookUpdateData(): Record<string, unknown> {
  const call = h.db.book.update.mock.calls.at(-1) as
    | [{ data: Record<string, unknown> }]
    | undefined;
  return call?.[0].data ?? {};
}

/** Chapter-table truth the reconcile must read back. */
function chaptersHold(chapterCount: number, wordCount: number | null) {
  h.db.chapter.aggregate.mockResolvedValue({
    _count: { _all: chapterCount },
    _sum: { wordCount },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({
    id: "b1",
    userId: "u1",
    seriesId: null,
  });
  h.db.book.update.mockResolvedValue({ id: "b1" });
  h.db.chapter.create.mockResolvedValue({ id: "c2", chapterNumber: 2 });
  h.db.chapter.delete.mockResolvedValue({});
  h.db.chapter.updateMany.mockResolvedValue({ count: 1 });
  h.deleteChapterChunks.mockResolvedValue(undefined);
  h.onDocumentChanged.mockResolvedValue(undefined);
  chaptersHold(1, 14);
});

describe("D-200: books.word_count follows the chapter rows", () => {
  it("chapter delete takes the deleted chapter's words back out of the book total", async () => {
    h.db.chapter.findFirst.mockResolvedValue({
      id: "c1",
      chapterNumber: 1,
      bookId: "b1",
      wordCount: 23,
    });
    // The live 50b shape: after the delete the book holds ONE chapter of 14
    // words. Pre-fix the stored total stayed at 37 forever.
    chaptersHold(1, 14);

    const res = await DELETE_CHAPTER(
      new NextRequest("http://t/api/books/b1/chapters/c1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "b1", chapterId: "c1" }) } as never
    );
    expect(res.status).toBe(200);

    expect(lastBookUpdateData()).toEqual({ chapterCount: 1, wordCount: 14 });
  });

  it("deleting the last chapter returns the book to zero words, not to its high-water mark", async () => {
    h.db.chapter.findFirst.mockResolvedValue({
      id: "c1",
      chapterNumber: 1,
      bookId: "b1",
      wordCount: 23,
    });
    // Prisma reports a null _sum for an empty set — that must read as 0 words,
    // not as "leave the stored total alone".
    chaptersHold(0, null);

    const res = await DELETE_CHAPTER(
      new NextRequest("http://t/api/books/b1/chapters/c1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "b1", chapterId: "c1" }) } as never
    );
    expect(res.status).toBe(200);

    expect(lastBookUpdateData()).toEqual({ chapterCount: 0, wordCount: 0 });
  });

  it("chapter create reconciles words too, so an already-drifted book self-heals", async () => {
    // Same self-heal argument D-194 made for the count: a book carrying a
    // stale total must converge on the next touch rather than ride it forever.
    chaptersHold(2, 20);

    const res = await CREATE_CHAPTER(
      jsonReq("http://t/api/books/b1/chapters", "POST", {
        actNumber: 1,
        chapterNumber: 2,
        title: "Two",
      }),
      { params: Promise.resolve({ id: "b1" }) } as never
    );
    expect(res.status).toBe(201);

    expect(lastBookUpdateData()).toEqual({ chapterCount: 2, wordCount: 20 });
  });

  it("creating CHAPTER_CONTENT through the document API moves the book total with the chapter", async () => {
    // This route rewrites chapters.word_count but never touched the book's,
    // so the same asymmetry left the book total stale in BOTH directions.
    h.svcCreate.mockResolvedValue({ id: "doc1" });
    chaptersHold(1, 3);

    const res = await CREATE_DOCUMENT(
      jsonReq("http://t/api/books/b1/documents", "POST", {
        type: "CHAPTER_CONTENT",
        content: "one two three",
        chapterNumber: 1,
      }),
      { params: Promise.resolve({ id: "b1" }) } as never
    );
    expect(res.status).toBe(201);

    expect(h.db.chapter.updateMany).toHaveBeenCalled();
    expect(lastBookUpdateData()).toEqual({ chapterCount: 1, wordCount: 3 });
  });

  it("updating CHAPTER_CONTENT through the document API moves the book total with the chapter", async () => {
    h.db.document.findFirst.mockResolvedValue({
      id: "doc1",
      bookId: "b1",
      type: "CHAPTER_CONTENT",
      chapterNumber: 1,
      currentVersion: 1,
    });
    h.svcUpdate.mockResolvedValue({
      document: { id: "doc1", currentVersion: 2 },
      version: { version: 2 },
    });
    chaptersHold(1, 5);

    const res = await UPDATE_DOCUMENT(
      jsonReq("http://t/api/books/b1/documents/doc1", "PATCH", {
        content: "one two three four five",
      }),
      { params: Promise.resolve({ id: "b1", docId: "doc1" }) } as never
    );
    expect(res.status).toBe(200);

    expect(h.db.chapter.updateMany).toHaveBeenCalled();
    expect(lastBookUpdateData()).toEqual({ chapterCount: 1, wordCount: 5 });
  });

  it("a non-chapter document leaves the counters alone", async () => {
    h.svcCreate.mockResolvedValue({ id: "doc2" });

    const res = await CREATE_DOCUMENT(
      jsonReq("http://t/api/books/b1/documents", "POST", {
        type: "STORY_BIBLE",
        content: "not prose the book counts",
      }),
      { params: Promise.resolve({ id: "b1" }) } as never
    );
    expect(res.status).toBe(201);

    expect(h.db.chapter.updateMany).not.toHaveBeenCalled();
    expect(h.db.book.update).not.toHaveBeenCalled();
  });
});

describe("reconcileBookCounters", () => {
  it("reads both counters from the chapter rows in one aggregate and stores them together", async () => {
    chaptersHold(3, 1200);

    const counters = await reconcileBookCounters("b1");

    expect(h.db.chapter.aggregate).toHaveBeenCalledWith({
      where: { bookId: "b1" },
      _count: { _all: true },
      _sum: { wordCount: true },
    });
    expect(counters).toEqual({ chapterCount: 3, wordCount: 1200 });
    expect(h.db.book.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { chapterCount: 3, wordCount: 1200 },
    });
  });
});
