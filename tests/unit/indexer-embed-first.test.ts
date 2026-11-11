// P2-42: indexDocument deleted a chapter's chunks before embedding the new
// ones, so an OpenAI 429, 5xx or timeout wiped the chapter from memory until
// the next save; a rebuild discarded failed documents and still answered
// success. The new chunks are now embedded first, and a rebuild reports how
// many documents failed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  embedBatch: vi.fn(),
  qdrant: { delete: vi.fn(), upsert: vi.fn() },
}));

vi.mock("@/lib/vector/embeddings", () => ({
  embedBatch: (texts: string[]) => h.embedBatch(texts),
  isEmbeddingAvailable: () => true,
}));
vi.mock("@/lib/vector/qdrant-client", () => ({
  qdrantClient: h.qdrant,
  ensureMemoryCollection: async () => true,
}));
vi.mock("@/lib/vector/cost-tracker", () => ({ trackEmbeddingCost: vi.fn() }));

import { indexDocument } from "@/lib/vector/indexer";

beforeEach(() => {
  vi.clearAllMocks();
  h.qdrant.delete.mockResolvedValue({});
  h.qdrant.upsert.mockResolvedValue({});
});

describe("indexDocument", () => {
  it("keeps the chapter's previous chunks when embedding fails", async () => {
    h.embedBatch.mockRejectedValue(new Error("429 rate limited"));
    await expect(
      indexDocument("b1", "chapter", "d1", "The sea kept the letters.", { chapterNumber: 3, chapterContent: true })
    ).rejects.toThrow("429");
    expect(h.qdrant.delete).not.toHaveBeenCalled();
    expect(h.qdrant.upsert).not.toHaveBeenCalled();
  });

  it("replaces the chunks once the new vectors exist", async () => {
    h.embedBatch.mockImplementation(async (texts: string[]) => ({
      vectors: texts.map(() => [0.1, 0.2]),
      tokensUsed: 10,
    }));
    await indexDocument("b1", "chapter", "d1", "The sea kept the letters.", { chapterNumber: 3, chapterContent: true });
    expect(h.qdrant.delete).toHaveBeenCalledTimes(1);
    expect(h.qdrant.delete.mock.invocationCallOrder[0]).toBeLessThan(h.qdrant.upsert.mock.invocationCallOrder[0]);
    expect(h.embedBatch.mock.invocationCallOrder[0]).toBeLessThan(h.qdrant.delete.mock.invocationCallOrder[0]);
  });
});

describe("rebuildBookIndex", () => {
  it("reports the documents that failed, and the route says so", () => {
    const root = join(__dirname, "..", "..");
    const cleanup = readFileSync(join(root, "src", "lib", "vector", "cleanup.ts"), "utf-8");
    expect(cleanup).toMatch(/failedDocuments/);
    expect(cleanup).toMatch(/result\.status === "rejected"/);
    const route = readFileSync(join(root, "src", "app", "api", "memory", "rebuild", "route.ts"), "utf-8");
    expect(route).toMatch(/failedDocuments: result\.failedDocuments/);
    expect(route).toMatch(/success: result\.failedDocuments === 0/);
  });
});
