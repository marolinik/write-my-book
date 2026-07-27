import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * D-194 — `books.chapter_count` drifts from the real chapter count.
 *
 * Measured (P2 44-series, direct SQL): every book CREATED in-product carries a
 * count one lower than its real chapter list (1 vs 2, 1 vs 2, 7 vs 8), while
 * imported books are correct. Root cause found in source, not in the create
 * route the register suspected: `POST /api/books` creates the write-first
 * placeholder Chapter 1 but never counts it (`chapter_count` keeps its schema
 * default 0), so every subsequent +1/-1 delta rides on a wrong base.
 *
 * Contract locked here:
 *   - book create → the placeholder chapter is counted (chapterCount = 1)
 *   - chapter create → the stored count is the AUTHORITATIVE row count, so a
 *     book whose base already drifted self-heals instead of drifting further
 *   - chapter delete → same authoritative recount (never a blind decrement)
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    bookSettings: { create: vi.fn() },
    chapter: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), count: vi.fn() },
  },
  checkPlanAccess: vi.fn(),
  deleteChapterChunks: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: (...a: unknown[]) => h.checkPlanAccess(...a),
}));
vi.mock("@/lib/vector", () => ({
  deleteChapterChunks: (...a: unknown[]) => h.deleteChapterChunks(...a),
}));

import { POST as CREATE_BOOK } from "@/app/api/books/route";
import { POST as CREATE_CHAPTER } from "@/app/api/books/[id]/chapters/route";
import { DELETE as DELETE_CHAPTER } from "@/app/api/books/[id]/chapters/[chapterId]/route";

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
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

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.checkPlanAccess.mockResolvedValue({ allowed: true });
  h.db.book.findFirst.mockResolvedValue(null);
  h.db.book.create.mockResolvedValue({ id: "b1", bookNumber: 1 });
  h.db.book.update.mockResolvedValue({ id: "b1" });
  h.db.bookSettings.create.mockResolvedValue({});
  h.db.chapter.create.mockResolvedValue({ id: "c1", chapterNumber: 1 });
  h.db.chapter.count.mockResolvedValue(0);
  h.deleteChapterChunks.mockResolvedValue(undefined);
});

describe("D-194: books.chapter_count tracks the real chapter list", () => {
  it("book create counts the write-first placeholder Chapter 1", async () => {
    const res = await CREATE_BOOK(
      jsonReq("http://t/api/books", { name: "Fresh Book" })
    );
    expect(res.status).toBe(201);

    // The placeholder chapter row is created…
    expect(h.db.chapter.create).toHaveBeenCalledTimes(1);
    // …and the denormalised counter must know about it. Pre-fix this stayed at
    // the schema default 0 and every book started life off-by-one.
    const updates = h.db.book.update.mock.calls.map(
      (c) => (c as [{ data: Record<string, unknown> }])[0].data
    );
    expect(updates.some((d) => d.chapterCount === 1)).toBe(true);
  });

  it("chapter create stores the authoritative row count (self-heals drift)", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
    h.db.chapter.create.mockResolvedValue({ id: "c2", chapterNumber: 2 });
    // Truth after the insert: two chapters. A drifted book (stored 1, real 2)
    // must converge here rather than ride the wrong base forever.
    h.db.chapter.count.mockResolvedValue(2);

    const res = await CREATE_CHAPTER(
      jsonReq("http://t/api/books/b1/chapters", {
        actNumber: 1,
        chapterNumber: 2,
        title: "Two",
      }),
      { params: Promise.resolve({ id: "b1" }) } as never
    );
    expect(res.status).toBe(201);

    expect(h.db.chapter.count).toHaveBeenCalledWith({
      where: { bookId: "b1" },
    });
    expect(lastBookUpdateData()).toEqual({ chapterCount: 2 });
  });

  it("chapter delete stores the authoritative row count (never a blind decrement)", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
    h.db.chapter.findFirst.mockResolvedValue({
      id: "c2",
      chapterNumber: 2,
      bookId: "b1",
    });
    h.db.chapter.delete.mockResolvedValue({});
    h.db.chapter.count.mockResolvedValue(1);

    const res = await DELETE_CHAPTER(
      new NextRequest("http://t/api/books/b1/chapters/c2", { method: "DELETE" }),
      { params: Promise.resolve({ id: "b1", chapterId: "c2" }) } as never
    );
    expect(res.status).toBe(200);

    expect(h.db.chapter.count).toHaveBeenCalledWith({
      where: { bookId: "b1" },
    });
    expect(lastBookUpdateData()).toEqual({ chapterCount: 1 });
  });
});
