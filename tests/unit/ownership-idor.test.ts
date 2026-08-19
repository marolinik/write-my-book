import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression lock for two cross-tenant IDORs found + fixed in the
 * bulletproof-QA campaign (2026-07-17):
 *  - Z1: GET /api/memory/stats?bookId= read another user's book chunk stats
 *        (missing ownership fence before getBookChunkCounts).
 *  - Z2: DELETE /api/books/:id/style/lenses/:lensId destroyed ANY lens by id
 *        (delete-by-id with no lens→book scope).
 * Both are RED on the pre-fix code: Z1 never called book.findFirst; Z2 used
 * db.characterLens.delete({ where: { id } }) instead of a bookId-scoped
 * deleteMany. Each test asserts the corrected observable, not a 200.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    characterLens: { deleteMany: vi.fn() },
  },
  getBookChunkCounts: vi.fn(),
  getEmbeddingCosts: vi.fn(),
  verifyQdrantConnection: vi.fn(),
  getGlobalMemoryStats: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector", () => ({
  getBookChunkCounts: (...a: unknown[]) => h.getBookChunkCounts(...a),
  getEmbeddingCosts: (...a: unknown[]) => h.getEmbeddingCosts(...a),
  verifyQdrantConnection: (...a: unknown[]) => h.verifyQdrantConnection(...a),
  getGlobalMemoryStats: (...a: unknown[]) => h.getGlobalMemoryStats(...a),
}));

import { GET as memoryStatsGET } from "@/app/api/memory/stats/route";
import { DELETE as lensDELETE } from "@/app/api/books/[id]/style/lenses/[lensId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.verifyQdrantConnection.mockResolvedValue(true);
  h.getBookChunkCounts.mockResolvedValue({ chunkCount: 42, lastIndexed: null });
  h.getEmbeddingCosts.mockResolvedValue({ cost: 0, tokens: 0 });
});

describe("Z1: GET /api/memory/stats ownership fence", () => {
  it("404s when the bookId is NOT owned — never reads foreign chunk stats", async () => {
    h.db.book.findFirst.mockResolvedValue(null); // book not owned by caller
    const res = await memoryStatsGET(
      new NextRequest("http://t/api/memory/stats?bookId=foreign") as never,
    );
    expect(res.status).toBe(404);
    // The fix must fence BEFORE hitting the vector store.
    expect(h.getBookChunkCounts).not.toHaveBeenCalled();
    const where = h.db.book.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: "foreign", userId: "u1" });
  });

  it("returns stats for an owned book", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "own" });
    h.getEmbeddingCosts.mockResolvedValue({ totalCost: 0, totalTokens: 0 });
    const res = await memoryStatsGET(
      new NextRequest("http://t/api/memory/stats?bookId=own") as never,
    );
    expect(res.status).toBe(200);
    expect(h.getBookChunkCounts).toHaveBeenCalledWith("own");
  });
});

describe("Z2: DELETE style lens ownership fence", () => {
  const ctx = { params: Promise.resolve({ id: "b1", lensId: "lensX" }) };
  const req = () =>
    new Request("http://t/api/books/b1/style/lenses/lensX", { method: "DELETE" });

  it("scopes the delete to {id: lensId, bookId} — not a bare id delete", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b1" });
    h.db.characterLens.deleteMany.mockResolvedValue({ count: 1 });
    const res = await lensDELETE(req() as never, ctx as never);
    expect(res.status).toBe(200);
    const where = h.db.characterLens.deleteMany.mock.calls[0][0].where;
    expect(where).toEqual({ id: "lensX", bookId: "b1" });
  });

  it("404s when the lens is not in the owned book (foreign lensId)", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b1" });
    h.db.characterLens.deleteMany.mockResolvedValue({ count: 0 });
    const res = await lensDELETE(req() as never, ctx as never);
    expect(res.status).toBe(404);
  });

  it("404s when the caller does not own the book", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await lensDELETE(req() as never, ctx as never);
    expect(res.status).toBe(404);
    expect(h.db.characterLens.deleteMany).not.toHaveBeenCalled();
  });
});
