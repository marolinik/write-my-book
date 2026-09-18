import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O9 — cross-book continuity was structurally blind. `continuity-checker` could
 * read only the current book's chapters, so everything cross-book came from the
 * series documents, which were concatenations: a book that never contributed was
 * simply invisible, and the agent could not tell the difference between "no
 * conflict" and "could not look".
 *
 * These two tools let it actually read a sibling book. Both are fenced to the
 * caller's own series: a book id from another writer must be unreachable.
 */

const h = vi.hoisted(() => ({
  db: {
    book: { findMany: vi.fn(), findFirst: vi.fn() },
    chapter: { findMany: vi.fn(), findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

const readMock = vi.fn();
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    read = readMock;
    findByType = vi.fn(async () => ({ id: "doc-1" }));
  },
}));

import { executeTool, getToolDefinitions } from "@/lib/agents/tools";

const ctx = {
  bookId: "b2",
  userId: "u1",
  sessionId: "s1",
  agentType: "continuity-checker",
  documentService: {} as never,
  seriesId: "ser1",
  language: "sr",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findMany.mockResolvedValue([
    { id: "b1", name: "Zakletva", bookNumber: 1, language: "sr", _count: { chapters: 12 } },
    { id: "b2", name: "Zavet", bookNumber: 2, language: "sr", _count: { chapters: 14 } },
  ]);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", name: "Zakletva", bookNumber: 1 });
  h.db.chapter.findFirst.mockResolvedValue({
    id: "c1",
    chapterNumber: 3,
    title: "Pismo",
    actNumber: 1,
  });
  readMock.mockResolvedValue({ document: { id: "doc-1" }, content: "Tekst trećeg poglavlja." });
});

describe("ListSeriesBooks", () => {
  it("lists the sibling books with their chapter counts", async () => {
    const out = await executeTool("ListSeriesBooks", ctx as never, {});
    expect(out).toContain("Zakletva");
    expect(out).toContain("12");
    expect(h.db.book.findMany.mock.calls[0][0].where).toMatchObject({
      seriesId: "ser1",
      userId: "u1",
    });
  });

  it("says plainly when the book is in no series", async () => {
    const out = await executeTool("ListSeriesBooks", { ...ctx, seriesId: undefined } as never, {});
    expect(out).toMatch(/not part of a series/i);
    expect(h.db.book.findMany).not.toHaveBeenCalled();
  });
});

describe("ReadSiblingChapter", () => {
  it("returns the sibling chapter's prose", async () => {
    const out = await executeTool("ReadSiblingChapter", ctx as never, {
      bookNumber: 1,
      chapterNumber: 3,
    });
    expect(out).toContain("Tekst trećeg poglavlja.");
    expect(out).toContain("Zakletva");
  });

  it("is fenced to this writer's own series", async () => {
    await executeTool("ReadSiblingChapter", ctx as never, { bookNumber: 1, chapterNumber: 3 });
    expect(h.db.book.findFirst.mock.calls[0][0].where).toMatchObject({
      seriesId: "ser1",
      userId: "u1",
      bookNumber: 1,
    });
  });

  it("refuses when the book is in no series", async () => {
    const out = await executeTool(
      "ReadSiblingChapter",
      { ...ctx, seriesId: undefined } as never,
      { bookNumber: 1, chapterNumber: 3 }
    );
    expect(out).toMatch(/not part of a series/i);
    expect(h.db.book.findFirst).not.toHaveBeenCalled();
  });

  it("says which book is missing rather than returning nothing", async () => {
    h.db.book.findFirst.mockResolvedValueOnce(null);
    const out = await executeTool("ReadSiblingChapter", ctx as never, {
      bookNumber: 9,
      chapterNumber: 1,
    });
    expect(out).toMatch(/9/);
    expect(readMock).not.toHaveBeenCalled();
  });

  it("says when the chapter has no text, instead of pretending it is empty", async () => {
    h.db.chapter.findFirst.mockResolvedValueOnce(null);
    const out = await executeTool("ReadSiblingChapter", ctx as never, {
      bookNumber: 1,
      chapterNumber: 99,
    });
    expect(out).toMatch(/99/);
  });
});

describe("tool definitions", () => {
  it("both tools are offered to agents that ask for them", () => {
    const defs = getToolDefinitions(["ListSeriesBooks", "ReadSiblingChapter"]);
    expect(defs.map((d) => d.name).sort()).toEqual([
      "ListSeriesBooks",
      "ReadSiblingChapter",
    ]);
  });
});
