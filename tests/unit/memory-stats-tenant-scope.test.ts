import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P7-S03 (UAT 2026-09-25): the Settings memory card showed every user the
 * point count of the whole shared `wmb_memory` collection and the timestamp
 * of whichever tenant's chunk the scroll returned first — platform totals
 * dressed up as the writer's own. The no-bookId branch of
 * GET /api/memory/stats must count only the caller's books.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: { book: { findFirst: vi.fn(), findMany: vi.fn() } },
  count: vi.fn(),
  scroll: vi.fn(),
  getCollection: vi.fn(),
  getCollections: vi.fn(),
  getEmbeddingCosts: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector/qdrant-client", () => ({
  qdrantClient: {
    count: (...a: unknown[]) => h.count(...a),
    scroll: (...a: unknown[]) => h.scroll(...a),
    getCollection: (...a: unknown[]) => h.getCollection(...a),
    getCollections: (...a: unknown[]) => h.getCollections(...a),
  },
  verifyQdrantConnection: async () => true,
  ensureMemoryCollection: async () => true,
  initVectorCollections: async () => {},
}));
vi.mock("@/lib/vector/cost-tracker", () => ({
  getEmbeddingCosts: (...a: unknown[]) => h.getEmbeddingCosts(...a),
  trackEmbeddingCost: vi.fn(),
}));

import { GET as statsGET } from "@/app/api/memory/stats/route";
import { getUserMemoryStats } from "@/lib/vector/consistency";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.getEmbeddingCosts.mockResolvedValue({ totalCost: 0.5, totalTokens: 1000 });
  // What the old code read: the platform-wide collection.
  h.getCollection.mockResolvedValue({ points_count: 6521 });
  h.getCollections.mockResolvedValue({ collections: [] });
  h.count.mockResolvedValue({ count: 0 });
  h.scroll.mockResolvedValue({ points: [], next_page_offset: null });
});

function bookFilterOf(call: unknown[]): unknown {
  return (call[1] as { filter: unknown }).filter;
}

describe("GET /api/memory/stats — the card counts only the caller's books", () => {
  it("never reports the shared collection's points_count", async () => {
    h.db.book.findMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);
    h.count.mockResolvedValue({ count: 12 });
    const res = await statsGET(new NextRequest("http://t/api/memory/stats"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalChunks).toBe(12);
    expect(h.db.book.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect(bookFilterOf(h.count.mock.calls[0])).toEqual({
      must: [{ key: "bookId", match: { any: ["b1", "b2"] } }],
    });
  });

  it("a writer with no books sees zero and no foreign timestamp", async () => {
    h.db.book.findMany.mockResolvedValue([]);
    h.scroll.mockResolvedValue({
      points: [{ payload: { timestamp: "2026-08-28T13:14:38.349Z" } }],
      next_page_offset: null,
    });
    const res = await statsGET(new NextRequest("http://t/api/memory/stats"));
    const body = await res.json();
    expect(body.totalChunks).toBe(0);
    expect(body.lastIndexed).toBeNull();
    expect(h.count).not.toHaveBeenCalled();
    expect(h.scroll).not.toHaveBeenCalled();
  });
});

describe("getUserMemoryStats", () => {
  it("returns the newest timestamp across every page of the caller's chunks", async () => {
    h.count.mockResolvedValue({ count: 3 });
    h.scroll
      .mockResolvedValueOnce({
        points: [
          { payload: { timestamp: "2026-09-01T00:00:00.000Z" } },
          { payload: { timestamp: "2026-09-03T00:00:00.000Z" } },
        ],
        next_page_offset: "p2",
      })
      .mockResolvedValueOnce({
        points: [{ payload: { timestamp: "2026-09-02T00:00:00.000Z" } }],
        next_page_offset: null,
      });
    const stats = await getUserMemoryStats(["b1"]);
    expect(stats.totalChunks).toBe(3);
    expect(stats.lastIndexed).toBe("2026-09-03T00:00:00.000Z");
    for (const call of h.scroll.mock.calls) {
      expect(bookFilterOf(call)).toEqual({
        must: [{ key: "bookId", match: { any: ["b1"] } }],
      });
    }
    expect(h.scroll.mock.calls[1][1].offset).toBe("p2");
  });

  it("degrades to zero when Qdrant is down", async () => {
    h.count.mockRejectedValue(new Error("down"));
    const stats = await getUserMemoryStats(["b1"]);
    expect(stats).toMatchObject({ totalChunks: 0, lastIndexed: null });
  });
});
