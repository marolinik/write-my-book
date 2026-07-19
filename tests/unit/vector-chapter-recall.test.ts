import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * D-75 — CRITICAL vector-recall crater: chapter-content indexing was BOOK-scoped,
 * not chapter-scoped, so the wmb_memory store kept chunks for only ONE chapter per
 * book (the last one written via either path). Two independent mechanisms caused it:
 *
 *   1. memory-manager collapsed every chapter to the same default docId
 *      (`${bookId}:CHAPTER_CONTENT`), and indexer.deleteChunksForDocument deleted by
 *      that shared docId before inserting the current chapter → each save wiped the
 *      previous chapter. It also made the debounce key collide, so a chapter save
 *      within the 2s window CANCELLED a different chapter's pending index.
 *
 * This suite drives the REAL memory-manager → scheduleIndex (real debounce) →
 * indexDocument → retriever chain over a fake Qdrant that honors payload `must`
 * filters (match / is_null / should), and fires the debounce with fake timers.
 *
 * The four crater tests are RED against the pre-fix code (only the last chapter, or a
 * duplicate, survives); the three guard tests stay GREEN throughout and pin the fix's
 * blast-radius invariants (chapter-scoped delete never crosses books, never clobbers a
 * chapter's brief/plan, and re-index replaces rather than duplicates).
 */

const h = vi.hoisted(() => {
  const store: Array<{ id: string; payload: Record<string, unknown> }> = [];

  const matchClause = (
    payload: Record<string, unknown>,
    clause: any
  ): boolean => {
    if (clause.match) return payload[clause.key] === clause.match.value;
    if (clause.is_null) return payload[clause.is_null.key] == null;
    if (clause.should)
      return clause.should.some((c: any) => matchClause(payload, c));
    return true;
  };
  const matchesFilter = (
    payload: Record<string, unknown>,
    filter: any
  ): boolean =>
    !filter ? true : (filter.must ?? []).every((c: any) => matchClause(payload, c));

  return { store, matchesFilter };
});

vi.mock("@/lib/vector/qdrant-client", () => ({
  qdrantClient: {
    upsert: async (
      _c: string,
      { points }: { points: Array<{ id: string; payload: Record<string, unknown> }> }
    ) => {
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
// One chunk per document, carrying the document's own text so tests can tell chapters
// (and successive versions of one chapter) apart by content.
vi.mock("@/lib/vector/chunker", () => ({
  stripMarkdown: (s: string) => s,
  chunkChapterContent: (text: string) => [
    { text, chunkIndex: 0, charactersMentioned: [] },
  ],
}));
vi.mock("@/lib/vector/cost-tracker", () => ({
  trackEmbeddingCost: async () => {},
}));
// memory-manager imports db at module scope (used only by onSessionCompleted here).
vi.mock("@/lib/db", () => ({ db: {} }));

import { onDocumentChanged } from "@/lib/vector/memory-manager";
import { searchMemory } from "@/lib/vector/retriever";

/** Fire any pending debounced indexes (default debounce is 2000ms). */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(2100);
}

/** Human editor save (content route shape): CHAPTER_CONTENT, no docId. */
async function humanSave(
  bookId: string,
  chapterNumber: number,
  content: string
): Promise<void> {
  await onDocumentChanged(bookId, "CHAPTER_CONTENT", content, {
    userId: "user-1",
    chapterId: `chap-${chapterNumber}`,
    chapterNumber,
    seriesId: null,
    language: "en",
    version: 1,
  });
}

/** Agent write save (post-session:832 shape): CHAPTER_CONTENT, no docId, no userId. */
async function agentSave(
  bookId: string,
  chapterNumber: number,
  content: string
): Promise<void> {
  await onDocumentChanged(bookId, "CHAPTER_CONTENT", content, {
    chapterNumber,
    seriesId: null,
  });
}

function chapterTexts(bookId: string, results: { payload: any }[]): string[] {
  return results
    .filter((r) => r.payload.docType === "chapter")
    .map((r) => String(r.payload.text));
}

beforeEach(() => {
  vi.useFakeTimers();
  h.store.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("D-75 within-book recall: all chapters coexist (crater pin)", () => {
  it("human path: ch1, ch2, ch3 saved in sequence are ALL queryable", async () => {
    await humanSave("book-1", 1, "Chapter one: the harbour at dawn.");
    await flush();
    await humanSave("book-1", 2, "Chapter two: the letter arrives.");
    await flush();
    await humanSave("book-1", 3, "Chapter three: the salt flats burn.");
    await flush();

    const hits = await searchMemory("book-1", "what happens", { limit: 20 });
    const texts = chapterTexts("book-1", hits);
    // RED pre-fix: only chapter three survives (the last write wiped 1 and 2).
    expect(texts).toHaveLength(3);
    expect(texts).toEqual(
      expect.arrayContaining([
        "Chapter one: the harbour at dawn.",
        "Chapter two: the letter arrives.",
        "Chapter three: the salt flats burn.",
      ])
    );
  });

  it("agent path: ch1, ch2, ch3 written by the agent are ALL queryable", async () => {
    await agentSave("book-agent", 1, "Agent chapter one body.");
    await flush();
    await agentSave("book-agent", 2, "Agent chapter two body.");
    await flush();
    await agentSave("book-agent", 3, "Agent chapter three body.");
    await flush();

    const hits = await searchMemory("book-agent", "what happens", { limit: 20 });
    expect(chapterTexts("book-agent", hits)).toHaveLength(3);
  });
});

describe("D-75 debounce: distinct chapters within the window both index", () => {
  it("two chapters saved inside the 2s window do NOT cancel each other", async () => {
    // Both scheduled before either debounce timer fires.
    await humanSave("book-deb", 1, "Debounce chapter one.");
    await humanSave("book-deb", 2, "Debounce chapter two.");
    await flush();

    const hits = await searchMemory("book-deb", "what happens", { limit: 20 });
    // RED pre-fix: the ch2 save shared a debounce key with ch1 and cancelled it → 1.
    expect(chapterTexts("book-deb", hits)).toHaveLength(2);
  });
});

describe("D-75 cross-path convergence: content route then document API = ONE chunk set", () => {
  it("a chapter written via both paths ends with a single, latest chunk set", async () => {
    // Content-route save (no docId → per-chapter default docId).
    await humanSave("book-conv", 1, "content-route body v1");
    await flush();
    // Document-API PATCH re-saves the SAME chapter with its real Document id as docId.
    await onDocumentChanged("book-conv", "CHAPTER_CONTENT", "document-api body v2", {
      docId: "real-doc-1",
      userId: "user-1",
      chapterNumber: 1,
    });
    await flush();

    const hits = await searchMemory("book-conv", "what happens", { limit: 20 });
    const texts = chapterTexts("book-conv", hits);
    // RED pre-fix: the two paths used different docIds, so docId-scoped delete left
    // BOTH chunk sets → 2 (duplicate). After the fix chapter-scoped delete converges.
    expect(texts).toEqual(["document-api body v2"]);
  });
});

describe("D-75 guards: chapter-scoped delete stays in its lane", () => {
  it("re-indexing a chapter replaces its chunks (no duplicate)", async () => {
    await humanSave("book-edit", 1, "first version of chapter one");
    await flush();
    await humanSave("book-edit", 1, "edited version of chapter one");
    await flush();

    const hits = await searchMemory("book-edit", "what happens", { limit: 20 });
    expect(chapterTexts("book-edit", hits)).toEqual([
      "edited version of chapter one",
    ]);
  });

  it("never deletes another book's chunk with the same chapter number", async () => {
    await humanSave("book-A", 1, "book A chapter one");
    await flush();
    await humanSave("book-B", 1, "book B chapter one");
    await flush();
    // Re-save book A chapter 1 — its chapter-scoped delete must not touch book B.
    await humanSave("book-A", 1, "book A chapter one edited");
    await flush();

    const bHits = await searchMemory("book-B", "what happens", { limit: 20 });
    expect(chapterTexts("book-B", bHits)).toEqual(["book B chapter one"]);
  });

  it("never deletes a chapter's brief/plan when its content is re-indexed", async () => {
    // Brief and content share the mapped 'chapter' docType AND the chapterNumber,
    // so a naive (bookId, chapterNumber)-only delete would clobber the brief.
    await humanSave("book-brief", 1, "chapter one prose");
    await flush();
    await onDocumentChanged("book-brief", "CHAPTER_BRIEF", "chapter one brief notes", {
      docId: "brief-doc-1",
      userId: "user-1",
      chapterNumber: 1,
    });
    await flush();
    // Re-save the chapter CONTENT; the brief must survive.
    await humanSave("book-brief", 1, "chapter one prose edited");
    await flush();

    const hits = await searchMemory("book-brief", "what happens", { limit: 20 });
    const texts = hits.map((r) => String(r.payload.text));
    expect(texts).toContain("chapter one brief notes");
    expect(texts).toContain("chapter one prose edited");
    expect(texts).not.toContain("chapter one prose"); // old content version gone
  });
});
