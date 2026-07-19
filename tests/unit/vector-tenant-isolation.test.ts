import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RC-6 B1: semantic search / vector memory was isolated by bookId ONLY — the
 * indexer accepted `metadata.userId` but DROPPED it, and buildFilter had no
 * tenant clause. One refactored caller passing an unverified bookId would then
 * surface another tenant's manuscript prose. These lock in:
 *   1. searchMemory({ userId }) sends a null-safe tenant clause to Qdrant.
 *   2. indexDocument writes userId into every chunk payload (null when absent).
 */

const h = vi.hoisted(() => ({
  search: vi.fn(),
  upsert: vi.fn(),
  del: vi.fn(),
  ensure: vi.fn(async () => true),
  embedText: vi.fn(async (..._a: unknown[]) => ({ vector: [0.1, 0.2, 0.3], tokensUsed: 3 })),
  embedBatch: vi.fn(async (..._a: unknown[]) => ({ vectors: [[0.1, 0.2, 0.3]], tokensUsed: 5 })),
  isAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/vector/qdrant-client", () => ({
  qdrantClient: {
    search: (...a: unknown[]) => h.search(...a),
    upsert: (...a: unknown[]) => h.upsert(...a),
    delete: (...a: unknown[]) => h.del(...a),
  },
  ensureMemoryCollection: () => h.ensure(),
}));
vi.mock("@/lib/vector/embeddings", () => ({
  embedText: (...a: unknown[]) => h.embedText(...a),
  embedBatch: (...a: unknown[]) => h.embedBatch(...a),
  isEmbeddingAvailable: () => h.isAvailable(),
}));
vi.mock("@/lib/vector/chunker", () => ({
  stripMarkdown: (s: string) => s,
  chunkChapterContent: () => [
    { text: "chunk-a", chunkIndex: 0, charactersMentioned: ["Mira"] },
  ],
}));
vi.mock("@/lib/vector/cost-tracker", () => ({
  trackEmbeddingCost: vi.fn(async () => {}),
}));

import { searchMemory } from "@/lib/vector/retriever";
import { indexDocument } from "@/lib/vector/indexer";

beforeEach(() => {
  vi.clearAllMocks();
  h.ensure.mockResolvedValue(true);
  h.isAvailable.mockReturnValue(true);
  h.search.mockResolvedValue([]);
  h.upsert.mockResolvedValue({});
  h.del.mockResolvedValue({});
});

describe("searchMemory tenant filter (RC-6 B1)", () => {
  it("adds a null-safe userId clause (match tenant OR legacy null) alongside the bookId must", async () => {
    await searchMemory("book-1", "who betrayed Mira?", { userId: "user-42" });

    expect(h.search).toHaveBeenCalledTimes(1);
    const opts = h.search.mock.calls[0][1] as { filter?: { must: any[] } };
    const must = opts.filter?.must ?? [];
    expect(must).toContainEqual({ key: "bookId", match: { value: "book-1" } });
    const tenantClause = must.find((c: any) => Array.isArray(c.should));
    expect(tenantClause).toBeDefined();
    expect(tenantClause.should).toEqual(
      expect.arrayContaining([
        { key: "userId", match: { value: "user-42" } },
        { is_null: { key: "userId" } },
      ])
    );
  });

  it("omits the tenant clause entirely when no userId is passed (backward compatible)", async () => {
    await searchMemory("book-1", "query", {});
    const opts = h.search.mock.calls[0][1] as { filter?: { must: any[] } };
    const must = opts.filter?.must ?? [];
    expect(must.some((c: any) => Array.isArray(c.should))).toBe(false);
    expect(must).toContainEqual({ key: "bookId", match: { value: "book-1" } });
  });
});

describe("indexDocument tenant payload (RC-6 B1)", () => {
  it("stamps metadata.userId onto every chunk payload", async () => {
    await indexDocument("book-1", "chapter", "doc-1", "some prose", {
      userId: "user-42",
    });
    expect(h.upsert).toHaveBeenCalledTimes(1);
    const { points } = h.upsert.mock.calls[0][1] as { points: Array<{ payload: any }> };
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) expect(p.payload.userId).toBe("user-42");
  });

  it("writes userId=null when the caller omits it (legacy, backward compatible)", async () => {
    await indexDocument("book-1", "chapter", "doc-1", "some prose", {});
    const { points } = h.upsert.mock.calls[0][1] as { points: Array<{ payload: any }> };
    for (const p of points) expect(p.payload.userId).toBeNull();
  });
});
