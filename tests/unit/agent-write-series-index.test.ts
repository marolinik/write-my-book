import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fix 10 / RC-5 (w-d-rootcause.md §RC-5, "Adjacent architectural defect"):
 * agent-written chapter prose was indexed into the vector store with
 * seriesId:null because updateChapterGraph() called onDocumentChanged() passing
 * only { chapterNumber }. Series-filtered vector recall (retriever buildFilter
 * applies a seriesId `must` clause) matches chunks by exact seriesId, so a
 * null-stamped chunk is invisible to every cross-book query — silently halving
 * series recall for any agent-assisted writing. Only human saves
 * (chapters/[chapterId]/content route) stamped book.seriesId.
 *
 * These pin the CALLER: updateChapterGraph must look the book's seriesId up and
 * thread it through, mirroring the human-save path. Standalone books
 * legitimately index seriesId:null (same as a book with no series).
 */

const h = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  bookFindUnique: vi.fn(),
  onDocumentChanged: vi.fn(async (..._a: unknown[]) => {}),
  updateFromChapter: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
  getExtractionKeysForUser: vi.fn(async (..._a: unknown[]): Promise<unknown> => ({})),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: h.userFindUnique },
    book: { findUnique: h.bookFindUnique },
  },
}));
// Keep the module hermetic: stub post-session's heavier collaborators so
// importing it never pulls the real graph / vector / series clients.
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
vi.mock("@/lib/vector/memory-manager", () => ({
  onSessionCompleted: vi.fn(),
  onDocumentChanged: (...a: unknown[]) => h.onDocumentChanged(...a),
  onFindingsCreated: vi.fn(),
}));
vi.mock("@/lib/agents/blackboard", () => ({ promoteFindings: vi.fn() }));
vi.mock("@/lib/series/series-synthesizer", () => ({ synthesizeToSeries: vi.fn() }));

import { updateChapterGraph } from "@/lib/agents/post-session";

const CONTENT = "Mira crossed the ash plain toward Vane.";

function docServiceStub() {
  return {
    findByType: vi.fn(async () => ({ id: "doc-1" })),
    read: vi.fn(async () => ({ content: CONTENT })),
  } as unknown as import("@/lib/documents/document-service").DocumentService;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.userFindUnique.mockResolvedValue({ defaultModel: "qwen3.6" });
  h.updateFromChapter.mockResolvedValue({});
  h.getExtractionKeysForUser.mockResolvedValue({});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("updateChapterGraph series-scope vector indexing (fix 10 / RC-5)", () => {
  it("stamps the book's seriesId onto agent-written chapter prose", async () => {
    h.bookFindUnique.mockResolvedValue({ seriesId: "series-1" });

    await updateChapterGraph("user-1", "book-1", 4, docServiceStub());

    // Looked the series scope up from the book it already has in scope.
    expect(h.bookFindUnique).toHaveBeenCalledWith({
      where: { id: "book-1" },
      select: { seriesId: true },
    });
    // Threaded seriesId (and preserved chapterNumber) into the vector index call.
    expect(h.onDocumentChanged).toHaveBeenCalledWith(
      "book-1",
      "CHAPTER_CONTENT",
      CONTENT,
      expect.objectContaining({ chapterNumber: 4, seriesId: "series-1" })
    );
  });

  it("indexes seriesId:null for a standalone book (no series) without error", async () => {
    h.bookFindUnique.mockResolvedValue({ seriesId: null });

    await updateChapterGraph("user-1", "book-standalone", 2, docServiceStub());

    expect(h.onDocumentChanged).toHaveBeenCalledWith(
      "book-standalone",
      "CHAPTER_CONTENT",
      CONTENT,
      expect.objectContaining({ chapterNumber: 2, seriesId: null })
    );
  });

  it("falls back to seriesId:null (never undefined/throw) when the book row is missing", async () => {
    h.bookFindUnique.mockResolvedValue(null);

    await expect(
      updateChapterGraph("user-1", "book-gone", 1, docServiceStub())
    ).resolves.toBeUndefined();

    const call = h.onDocumentChanged.mock.calls.at(-1);
    expect(call?.[3]).toMatchObject({ seriesId: null });
  });

  it("never re-nulls seriesId for a series book (regression pin: no bare { chapterNumber } call)", async () => {
    h.bookFindUnique.mockResolvedValue({ seriesId: "series-9" });

    await updateChapterGraph("user-1", "book-9", 7, docServiceStub());

    const meta = h.onDocumentChanged.mock.calls.at(-1)?.[3] as
      | { seriesId?: string | null }
      | undefined;
    expect(meta).toBeDefined();
    // The pre-fix bug: metadata was { chapterNumber } with seriesId absent.
    expect(meta).toHaveProperty("seriesId");
    expect(meta?.seriesId).toBe("series-9");
  });
});
