import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P1-S06 — GET /api/memory/stats must carry the paused state, so the memory
 * card can say it instead of "8 chunks · Indexed 1m ago" as if memory were
 * current for a Free writer at 45,000 words.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  paused: vi.fn(),
  db: { book: { findFirst: vi.fn(), findMany: vi.fn() } },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector", () => ({
  getBookChunkCounts: async () => ({ chunkCount: 8, lastIndexed: "2026-09-25T02:00:00.000Z" }),
  getUserMemoryStats: async () => ({ totalChunks: 8, totalSearches: 0, lastIndexed: null }),
  // Older name, kept for a route that has not moved to the per-user totals.
  getGlobalMemoryStats: async () => ({ totalChunks: 8, totalSearches: 0, lastIndexed: null }),
  verifyQdrantConnection: async () => true,
  getEmbeddingCosts: async () => ({ totalCost: 0, totalTokens: 0 }),
}));
vi.mock("@/lib/vector/indexing-gate", () => ({
  isProseIndexingPausedForUser: (...a: unknown[]) => h.paused(...a),
}));

import { GET } from "@/app/api/memory/stats/route";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.book.findMany.mockResolvedValue([{ id: "b1" }]);
  h.paused.mockResolvedValue(false);
});

describe("GET /api/memory/stats — indexingPaused", () => {
  it("per-book: reports the pause for this writer", async () => {
    h.paused.mockResolvedValue(true);
    const res = await GET(new NextRequest("http://t/api/memory/stats?bookId=b1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.indexingPaused).toBe(true);
    expect(body.chunkCount).toBe(8);
    expect(h.paused).toHaveBeenCalledWith("u1");
  });

  it("per-book: false when indexing is running", async () => {
    const res = await GET(new NextRequest("http://t/api/memory/stats?bookId=b1"));
    expect((await res.json()).indexingPaused).toBe(false);
  });

  it("the writer's totals (settings) carry it too", async () => {
    h.paused.mockResolvedValue(true);
    const res = await GET(new NextRequest("http://t/api/memory/stats"));
    expect(res.status).toBe(200);
    expect((await res.json()).indexingPaused).toBe(true);
  });
});
