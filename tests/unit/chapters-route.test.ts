import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// D-20: POST /api/books/:id/chapters mapped a Prisma P2002 unique-constraint
// violation (e.g. creating a chapterNumber that already exists — the
// auto-created placeholder Chapter 1) to a raw 500 "Failed to create chapter".
// A duplicate-number create is a client/conflict condition, not a server fault,
// so it must return a clean 409. A generic (non-P2002) create failure must
// still be a 500 — the P2002 branch must not over-catch.
const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), update: vi.fn() },
    chapter: { create: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { POST as POST_CHAPTER } from "@/app/api/books/[id]/chapters/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_CHAPTER = { actNumber: 1, chapterNumber: 1, title: "Chapter 1" };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.book.update.mockResolvedValue({ id: "b1" });
  h.db.chapter.create.mockResolvedValue({ id: "c1", chapterNumber: 1 });
});

describe("POST /api/books/:id/chapters classes errors honestly (D-20)", () => {
  it("duplicate chapterNumber (create throws P2002) → 409, not raw 500", async () => {
    const dup = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    h.db.chapter.create.mockRejectedValue(dup);

    const res = await POST_CHAPTER(
      jsonReq("http://t/api/books/b1/chapters", "POST", VALID_CHAPTER),
      ctx as never
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.error).toMatch(/already exists/i);
  });

  it("generic (non-P2002) create failure → still 500 (no over-catch)", async () => {
    h.db.chapter.create.mockRejectedValue(new Error("ECONNREFUSED 5432"));

    const res = await POST_CHAPTER(
      jsonReq("http://t/api/books/b1/chapters", "POST", VALID_CHAPTER),
      ctx as never
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|5432/);
  });

  it("unauthenticated → 401 (unchanged)", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));

    const res = await POST_CHAPTER(
      jsonReq("http://t/api/books/b1/chapters", "POST", VALID_CHAPTER),
      ctx as never
    );

    expect(res.status).toBe(401);
  });
});
