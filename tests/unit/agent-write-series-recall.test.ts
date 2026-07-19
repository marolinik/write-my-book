import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fix 10 / RC-5 recall proof (end-to-end through the REAL memory-manager +
 * indexer + retriever, over a fake Qdrant that honors payload `must` filters).
 *
 * Drives the actual agent-write path — updateChapterGraph() → onDocumentChanged
 * → scheduleIndex → indexDocument — then queries with searchMemory. Before the
 * fix the agent-written chunk lands with seriesId:null, so a series-filtered
 * recall (the flagship cross-book sidebar) MISSES it even though a bookId-scoped
 * search finds it. After the fix the chunk carries the book's seriesId and the
 * series recall returns it.
 *
 * Only the boundaries are mocked (Qdrant, embeddings, chunker, cost-tracker, the
 * DB, and post-session's non-vector collaborators). The debounce in
 * scheduleIndex is replaced with a synchronous call to the REAL indexDocument so
 * the test is deterministic without fake timers; every other vector-layer step
 * runs for real.
 */

const h = vi.hoisted(() => {
  const store: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const pending: Array<Promise<unknown>> = [];

  const matchClause = (payload: Record<string, unknown>, clause: any): boolean => {
    if (clause.match) return payload[clause.key] === clause.match.value;
    if (clause.is_null) return payload[clause.is_null.key] == null;
    if (clause.should) return clause.should.some((c: any) => matchClause(payload, c));
    return true;
  };
  const matchesFilter = (payload: Record<string, unknown>, filter: any): boolean =>
    !filter ? true : (filter.must ?? []).every((c: any) => matchClause(payload, c));

  return {
    store,
    pending,
    matchesFilter,
    userFindUnique: vi.fn(),
    bookFindUnique: vi.fn(),
    updateFromChapter: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
    getExtractionKeysForUser: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
  };
});

vi.mock("@/lib/vector/qdrant-client", () => ({
  qdrantClient: {
    upsert: async (_c: string, { points }: { points: Array<{ id: string; payload: Record<string, unknown> }> }) => {
      for (const p of points) h.store.push({ id: p.id, payload: p.payload });
      return {};
    },
    search: async (_c: string, opts: { limit?: number; filter?: unknown }) =>
      h.store
        .filter((p) => h.matchesFilter(p.payload, opts.filter))
        .slice(0, opts.limit ?? 5)
        .map((p) => ({ id: p.id, score: 0.9, payload: p.payload })),
    delete: async (_c: string, { filter }: { filter: unknown }) => {
      for (let i = h.store.length - 1; i >= 0; i--) {
        if (h.matchesFilter(h.store[i].payload, filter)) h.store.splice(i, 1);
      }
      return {};
    },
  },
  ensureMemoryCollection: async () => true,
}));
vi.mock("@/lib/vector/embeddings", () => ({
  embedText: async () => ({ vector: [0.1, 0.2, 0.3], tokensUsed: 3 }),
  embedBatch: async (texts: string[]) => ({
    vectors: texts.map(() => [0.1, 0.2, 0.3]),
    tokensUsed: 5,
  }),
  isEmbeddingAvailable: () => true,
}));
vi.mock("@/lib/vector/chunker", () => ({
  stripMarkdown: (s: string) => s,
  chunkChapterContent: (text: string) => [
    { text, chunkIndex: 0, charactersMentioned: ["Mira"] },
  ],
}));
vi.mock("@/lib/vector/cost-tracker", () => ({
  trackEmbeddingCost: async () => {},
}));
// Real indexDocument, but scheduleIndex fires it synchronously (no debounce).
vi.mock("@/lib/vector/indexer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vector/indexer")>();
  return {
    ...actual,
    scheduleIndex: (
      bookId: string,
      docType: string,
      docId: string,
      content: string,
      metadata: Record<string, unknown>
    ) => {
      h.pending.push(
        actual.indexDocument(bookId, docType as never, docId, content, metadata)
      );
    },
  };
});

// post-session's non-vector collaborators (memory-manager + retriever stay REAL).
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: h.userFindUnique },
    book: { findUnique: h.bookFindUnique },
  },
}));
vi.mock("@/lib/documents/document-service", () => ({ DocumentService: class {} }));
vi.mock("@/lib/parsers", () => ({
  parseAgentOutput: vi.fn(),
  extractNumericScore: vi.fn(),
}));
vi.mock("@/lib/graph/graph-maintenance", () => ({
  updateFromChapter: (...a: unknown[]) => h.updateFromChapter(...a),
}));
vi.mock("@/lib/agents/extraction-keys", () => ({
  getExtractionKeysForUser: (...a: unknown[]) => h.getExtractionKeysForUser(...a),
}));
vi.mock("@/lib/agents/blackboard", () => ({ promoteFindings: vi.fn() }));
vi.mock("@/lib/series/series-synthesizer", () => ({ synthesizeToSeries: vi.fn() }));

import { updateChapterGraph } from "@/lib/agents/post-session";
import { searchMemory } from "@/lib/vector/retriever";

const CONTENT = "Mira crossed the ash plain toward Vane, who once was her ally.";

function docServiceStub() {
  return {
    findByType: async () => ({ id: "doc-1" }),
    read: async () => ({ content: CONTENT }),
  } as unknown as import("@/lib/documents/document-service").DocumentService;
}

async function flushIndexing() {
  await Promise.all(h.pending);
  h.pending.length = 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.store.length = 0;
  h.pending.length = 0;
  h.userFindUnique.mockResolvedValue({ defaultModel: "qwen3.6" });
  h.updateFromChapter.mockResolvedValue({});
  h.getExtractionKeysForUser.mockResolvedValue({});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("agent-written prose is recallable by series-filtered search (fix 10 / RC-5)", () => {
  it("series recall returns an agent-written chapter that a null seriesId would miss", async () => {
    h.bookFindUnique.mockResolvedValue({ seriesId: "series-1" });

    await updateChapterGraph("user-1", "book-1", 4, docServiceStub());
    await flushIndexing();

    // Sanity: the chunk WAS indexed (bookId-scoped recall finds it either way).
    const bookHits = await searchMemory("book-1", "who is Mira", {});
    expect(bookHits.length).toBe(1);

    // The fix: series-filtered recall (the cross-book sidebar) now returns it.
    // Pre-fix this was [] because the chunk carried seriesId:null.
    const seriesHits = await searchMemory("book-1", "who is Mira", {
      seriesId: "series-1",
    });
    expect(seriesHits.length).toBe(1);
    expect(seriesHits[0].payload.seriesId).toBe("series-1");
    expect(seriesHits[0].payload.docType).toBe("chapter");
  });

  it("a standalone book indexes seriesId:null and stays reachable by bookId recall", async () => {
    h.bookFindUnique.mockResolvedValue({ seriesId: null });

    await updateChapterGraph("user-1", "book-solo", 2, docServiceStub());
    await flushIndexing();

    const hits = await searchMemory("book-solo", "who is Mira", {});
    expect(hits.length).toBe(1);
    expect(hits[0].payload.seriesId).toBeNull();

    // A cross-series query must not surface an unrelated standalone book's prose.
    const seriesHits = await searchMemory("book-solo", "who is Mira", {
      seriesId: "series-1",
    });
    expect(seriesHits.length).toBe(0);
  });
});
