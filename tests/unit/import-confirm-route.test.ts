import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/books/:id/import, structured (JSON) confirm.
 *
 * P6-S05 — `return handleStructuredImport(...)` was not awaited inside POST's
 * try, so every schema failure (empty list, unknown action) escaped as a bare
 * 500 with no body. And `replace` of a chapter that does not exist wrote the
 * CHAPTER_CONTENT document first, then threw P2025 on the chapter row: a 500
 * and an orphan document. The whole request is now checked before anything is
 * written, and a failed check answers 4xx with a body.
 *
 * P6-S04 (server half) — `create` upserted over an existing chapter: title,
 * status reset to "drafted", and an import version on top of the writer's
 * edited text. Overwriting the writer's work now needs an explicit `replace`;
 * only the blank, untitled Chapter 1 a new book starts with may be filled by
 * `create`.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
  doc: { findByType: vi.fn(), update: vi.fn(), create: vi.fn() },
  reconcile: vi.fn(),
  indexBatch: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.doc.findByType;
    update = h.doc.update;
    create = h.doc.create;
  },
}));
vi.mock("@/lib/books/book-counters", () => ({
  reconcileBookCounters: (...a: unknown[]) => h.reconcile(...a),
}));
vi.mock("@/lib/vector", () => ({ indexBatch: (...a: unknown[]) => h.indexBatch(...a) }));
vi.mock("@/lib/storage", () => ({ getBookStorage: () => ({ write: vi.fn() }) }));
vi.mock("@/lib/import-export/docx-to-markdown", () => ({ convertDocxToMarkdown: vi.fn() }));

import { POST } from "@/app/api/books/[id]/import/route";

const params = { params: Promise.resolve({ id: "b1" }) };

function confirm(body: unknown) {
  return POST(
    new Request("http://t/api/books/b1/import", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as never,
    params
  );
}

const row = (number: number, action: string, title = `T${number}`) => ({
  number,
  title,
  content: `words of chapter ${number}`,
  action,
});

/** Chapters 1-29 hold the writer's work; 1 and 2 are edited. */
const WRITTEN_BOOK = Array.from({ length: 29 }, (_, i) => ({
  chapterNumber: i + 1,
  title: `Chapter title ${i + 1}`,
  wordCount: 3000,
}));

function noWrites() {
  expect(h.doc.create).not.toHaveBeenCalled();
  expect(h.doc.update).not.toHaveBeenCalled();
  expect(h.db.chapter.upsert).not.toHaveBeenCalled();
  expect(h.db.chapter.update).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.chapter.findMany.mockResolvedValue(WRITTEN_BOOK);
  h.db.chapter.upsert.mockResolvedValue({});
  h.db.chapter.update.mockResolvedValue({});
  h.doc.findByType.mockResolvedValue(null);
  h.doc.update.mockResolvedValue({});
  h.doc.create.mockResolvedValue({});
  h.reconcile.mockResolvedValue({ chapterCount: 29 });
  h.indexBatch.mockResolvedValue(undefined);
});

describe("P6-S05 — schema failures answer 400 with a body", () => {
  it("an empty chapter list", async () => {
    const res = await confirm({ chapters: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid input");
    noWrites();
  });

  it("an unknown action", async () => {
    const res = await confirm({ chapters: [row(3, "bogus")] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid input");
    noWrites();
  });

  it("malformed JSON still answers 400", async () => {
    const res = await POST(
      new Request("http://t/api/books/b1/import", {
        method: "POST",
        body: "{bad",
        headers: { "content-type": "application/json" },
      }) as never,
      params
    );
    expect(res.status).toBe(400);
  });
});

describe("P6-S05 — replace of a missing chapter writes nothing", () => {
  it("answers 4xx naming the chapter, and leaves no orphan document", async () => {
    const res = await confirm({ chapters: [row(41, "replace")] });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(body.error).toMatch(/41/);
    expect(body.nothingToReplace).toEqual([41]);
    noWrites();
  });

  it("one bad row stops the whole request before the good rows are written", async () => {
    const res = await confirm({
      chapters: [row(5, "replace"), row(40, "replace"), row(30, "create")],
    });
    expect(res.status).toBe(409);
    noWrites();
  });

  it("two rows for one chapter number are refused", async () => {
    const res = await confirm({ chapters: [row(30, "create"), row(30, "create")] });
    expect(res.status).toBe(400);
    expect((await res.json()).duplicates).toEqual([30]);
    noWrites();
  });
});

describe("P6-S04 — create never overwrites the writer's chapter", () => {
  it("create onto an existing, written chapter is refused with 409", async () => {
    const res = await confirm({ chapters: [row(1, "create"), row(2, "create")] });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.wouldOverwrite).toEqual([1, 2]);
    noWrites();
  });

  it("create fills the blank, untitled Chapter 1 a new book starts with", async () => {
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, title: null, wordCount: 0 },
    ]);
    const res = await confirm({ chapters: [row(1, "create"), row(2, "create")] });
    expect(res.status).toBe(200);
    expect(h.db.chapter.upsert).toHaveBeenCalledTimes(2);
    expect(h.doc.create).toHaveBeenCalledTimes(2);
  });

  it("create past the last chapter adds new chapters", async () => {
    const res = await confirm({ chapters: [row(30, "create")] });
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(1);
  });

  it("an explicit replace keeps the chapter's status and writes the row before the document", async () => {
    h.doc.findByType.mockResolvedValue({ id: "d5" });
    const order: string[] = [];
    h.db.chapter.update.mockImplementation(async () => {
      order.push("chapter");
      return {};
    });
    h.doc.update.mockImplementation(async () => {
      order.push("document");
      return {};
    });
    const res = await confirm({ chapters: [row(5, "replace", "Svadba"), row(6, "skip")] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replaced).toBe(1);
    expect(order).toEqual(["chapter", "document"]);
    const update = h.db.chapter.update.mock.calls[0][0];
    expect(update.where.bookId_chapterNumber.chapterNumber).toBe(5);
    expect(update.data.status).toBeUndefined();
    expect(update.data.title).toBe("Svadba");
    expect(h.db.chapter.upsert).not.toHaveBeenCalled();
  });

  it("skip rows are never checked or written", async () => {
    const res = await confirm({ chapters: [row(1, "skip"), row(2, "skip")] });
    expect(res.status).toBe(200);
    noWrites();
  });
});
