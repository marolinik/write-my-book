import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P7-S12 (UAT 2026-09-25): renaming a book to the name of another of the
 * writer's books, or renumbering a chapter onto a taken number, tripped the
 * unique constraint (Prisma P2002) and fell through to the catch-all 500.
 * A taken value is a conflict the writer can fix, not a server fault: 409 with
 * the same message the create routes already give (D-20).
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    chapter: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector", () => ({
  deleteBookChunks: vi.fn(async () => {}),
  deleteChapterChunks: vi.fn(async () => {}),
}));
vi.mock("@/lib/storage", () => ({ getBookStorage: vi.fn() }));
vi.mock("@/lib/books/book-counters", () => ({ reconcileBookCounters: vi.fn() }));

import { PATCH as bookPATCH } from "@/app/api/books/[id]/route";
import { PATCH as chapterPATCH } from "@/app/api/books/[id]/chapters/[chapterId]/route";

const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

function patch(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.chapter.findFirst.mockResolvedValue({ id: "c2", bookId: "b1", chapterNumber: 2 });
});

describe("PATCH /api/books/:id — a taken name", () => {
  it("is a 409 that says the name exists, not a 500", async () => {
    h.db.book.update.mockRejectedValue(p2002());
    const res = await bookPATCH(patch("http://t/api/books/b1", { name: "Alpha" }), {
      params: Promise.resolve({ id: "b1" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("A book with this name already exists");
  });

  it("any other failure is still a 500", async () => {
    h.db.book.update.mockRejectedValue(new Error("connection lost"));
    const res = await bookPATCH(patch("http://t/api/books/b1", { name: "Alpha" }), {
      params: Promise.resolve({ id: "b1" }),
    });
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/books/:id/chapters/:chapterId — a taken number", () => {
  it("is a 409 that says the number exists, not a 500", async () => {
    h.db.chapter.update.mockRejectedValue(p2002());
    const res = await chapterPATCH(
      patch("http://t/api/books/b1/chapters/c2", { chapterNumber: 1 }),
      { params: Promise.resolve({ id: "b1", chapterId: "c2" }) }
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "A chapter with that number already exists in this book"
    );
  });
});
