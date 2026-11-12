// P2-41: three of four indexing paths skipped the Free-tier spend gate, and
// the agent paths passed no userId, so chunks were stamped userId null (the
// per-user filter a no-op) and embedding cost was never tracked. The gate now
// lives inside indexDocument itself.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  embedBatch: vi.fn(),
  qdrant: { delete: vi.fn(), upsert: vi.fn() },
  canIndex: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/vector/embeddings", () => ({
  embedBatch: (texts: string[]) => h.embedBatch(texts),
  isEmbeddingAvailable: () => true,
}));
vi.mock("@/lib/vector/qdrant-client", () => ({
  qdrantClient: h.qdrant,
  ensureMemoryCollection: async () => true,
}));
vi.mock("@/lib/vector/cost-tracker", () => ({ trackEmbeddingCost: (...a: unknown[]) => h.track(...a) }));
vi.mock("@/lib/vector/indexing-gate", () => ({ canIndexProseForUser: (u: string) => h.canIndex(u) }));

import { indexDocument } from "@/lib/vector/indexer";

const TEXT = "The sea kept the letters she never sent.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.qdrant.delete.mockResolvedValue({});
  h.qdrant.upsert.mockResolvedValue({});
  h.track.mockResolvedValue(undefined);
  h.embedBatch.mockImplementation(async (texts: string[]) => ({ vectors: texts.map(() => [0.1]), tokensUsed: 12 }));
});

describe("indexDocument spend gate", () => {
  it("refuses a call without a userId and spends nothing", async () => {
    const r = await indexDocument("b1", "chapter", "d1", TEXT, { chapterNumber: 1 });
    expect(r.skipped).toBe(true);
    expect(h.embedBatch).not.toHaveBeenCalled();
  });

  it("skips a Free writer past the cap", async () => {
    h.canIndex.mockResolvedValue(false);
    const r = await indexDocument("b1", "chapter", "d1", TEXT, { userId: "u1", chapterNumber: 1 });
    expect(r.skipped).toBe(true);
    expect(h.canIndex).toHaveBeenCalledWith("u1");
    expect(h.embedBatch).not.toHaveBeenCalled();
  });

  it("indexes an allowed writer, stamps the userId and tracks the cost", async () => {
    h.canIndex.mockResolvedValue(true);
    const r = await indexDocument("b1", "chapter", "d1", TEXT, { userId: "u1", chapterNumber: 1 });
    expect(r.skipped).toBe(false);
    const payload = h.qdrant.upsert.mock.calls[0][1].points[0].payload;
    expect(payload.userId).toBe("u1");
    expect(h.track).toHaveBeenCalledWith("u1", "b1", 12);
  });
});

describe("every agent indexing path passes the writer", () => {
  const postSession = readFileSync("src/lib/agents/post-session.ts", "utf8");
  const tools = readFileSync("src/lib/agents/tools.ts", "utf8");

  it("the agent chapter re-index passes userId", () => {
    const call = postSession.slice(postSession.indexOf('await onDocumentChanged(bookId, "CHAPTER_CONTENT"'));
    expect(call.slice(0, 200)).toMatch(/userId/);
  });

  it("session memory passes userId", () => {
    const call = postSession.slice(postSession.indexOf("onSessionCompleted("));
    expect(call.slice(0, 250)).toMatch(/userId: ctx\.userId/);
  });

  it("RememberInsight passes the session's user", () => {
    expect(tools).not.toMatch(/\{ userId: undefined \}/);
  });
});
