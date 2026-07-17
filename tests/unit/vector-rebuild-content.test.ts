import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * VM2 regression lock: rebuildBookIndex must embed the document's ACTUAL
 * content (read from storage via DocumentService), not a
 * `[Document: type] Storage key: …` placeholder. Pre-fix it passed the stub,
 * so vector recall matched metadata instead of the manuscript.
 */

const h = vi.hoisted(() => ({
  indexDocument: vi.fn(),
  read: vi.fn(),
  db: {
    document: { findMany: vi.fn() },
    chapter: { findMany: vi.fn() },
  },
  qdrantDelete: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/vector/indexer", () => ({
  indexDocument: (...a: unknown[]) => h.indexDocument(...a),
}));
vi.mock("@/lib/vector/qdrant-client", () => ({
  qdrantClient: { delete: (...a: unknown[]) => h.qdrantDelete(...a) },
}));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    read = h.read;
  },
}));

import { rebuildBookIndex } from "@/lib/vector/cleanup";

beforeEach(() => {
  vi.clearAllMocks();
  h.db.document.findMany.mockResolvedValue([
    { id: "d1", type: "CHAPTER_CONTENT", storageKey: "books/b1/ch1.md", chapterNumber: 1 },
  ]);
  h.db.chapter.findMany.mockResolvedValue([{ id: "d1", chapterNumber: 1 }]);
  h.read.mockResolvedValue({
    content: "Vera climbed the lighthouse stairs; the brass lamp was warm.",
  });
  h.indexDocument.mockResolvedValue({ chunksIndexed: 2, skipped: false });
});

describe("VM2: rebuildBookIndex embeds real content", () => {
  it("passes the storage content to indexDocument, never a [Document:] stub", async () => {
    await rebuildBookIndex("b1", "u1");

    expect(h.read).toHaveBeenCalledWith("d1");
    expect(h.indexDocument).toHaveBeenCalledTimes(1);
    const [bookId, , docId, content] = h.indexDocument.mock.calls[0];
    expect(bookId).toBe("b1");
    expect(docId).toBe("d1");
    expect(content).toBe(
      "Vera climbed the lighthouse stairs; the brass lamp was warm."
    );
    expect(content).not.toContain("[Document:");
    expect(content).not.toContain("Storage key:");
  });

  it("skips documents whose stored content is empty (no stub fallback)", async () => {
    h.read.mockResolvedValue({ content: "   " });
    await rebuildBookIndex("b1", "u1");
    expect(h.indexDocument).not.toHaveBeenCalled();
  });
});
