import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/books/:id/import, legacy multipart upload.
 *
 * P6-S04 closed the overwrite on the structured JSON confirm: `create` onto a
 * chapter that holds the writer's work answers 409 unless the row says
 * `replace`. The older multipart path — one request, files in, chapters out —
 * kept upserting straight over whatever numbers the parser found. A manuscript
 * that starts at "Chapter 1" posted here still reset the writer's edited
 * chapters 1 and 2 to "drafted" and stacked an import version on their text.
 * Both paths now read the same conflict rule.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
  doc: { findByType: vi.fn(), update: vi.fn(), create: vi.fn() },
  storageWrite: vi.fn(),
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
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => ({ write: (...a: unknown[]) => h.storageWrite(...a) }),
}));
vi.mock("@/lib/import-export/docx-to-markdown", () => ({ convertDocxToMarkdown: vi.fn() }));

import { POST } from "@/app/api/books/[id]/import/route";

const params = { params: Promise.resolve({ id: "b1" }) };

function upload(text: string, name = "Rukopis.md") {
  const form = new FormData();
  form.append("files", new File([text], name, { type: "text/markdown" }));
  return POST(new Request("http://t/api/books/b1/import", { method: "POST", body: form }) as never, params);
}

const TWO_CHAPTERS = "# Chapter 1: Zakletva\n\nPrva reč.\n\n# Chapter 2: Pismo\n\nDruga reč.\n";

/** Chapters 1-29 hold the writer's work. */
const WRITTEN_BOOK = Array.from({ length: 29 }, (_, i) => ({
  chapterNumber: i + 1,
  title: `Chapter title ${i + 1}`,
  wordCount: 3000,
}));

function noWrites() {
  expect(h.doc.create).not.toHaveBeenCalled();
  expect(h.doc.update).not.toHaveBeenCalled();
  expect(h.db.chapter.upsert).not.toHaveBeenCalled();
  expect(h.storageWrite).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.chapter.findMany.mockResolvedValue(WRITTEN_BOOK);
  h.db.chapter.upsert.mockResolvedValue({});
  h.doc.findByType.mockResolvedValue(null);
  h.doc.create.mockResolvedValue({});
  h.storageWrite.mockResolvedValue(undefined);
  h.reconcile.mockResolvedValue({ chapterCount: 29 });
  h.indexBatch.mockResolvedValue(undefined);
});

describe("legacy multipart import never overwrites the writer's chapters", () => {
  it("a manuscript landing on written chapters is refused with 409 and nothing is written", async () => {
    const res = await upload(TWO_CHAPTERS);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.wouldOverwrite).toEqual([1, 2]);
    expect(body.error).toMatch(/already hold/);
    noWrites();
  });

  it("fills the blank, untitled Chapter 1 a new book starts with", async () => {
    h.db.chapter.findMany.mockResolvedValue([{ chapterNumber: 1, title: null, wordCount: 0 }]);

    const res = await upload(TWO_CHAPTERS);

    expect(res.status).toBe(200);
    expect(h.db.chapter.upsert).toHaveBeenCalledTimes(2);
    expect(h.doc.create).toHaveBeenCalledTimes(2);
  });

  it("chapters past the last written one are added", async () => {
    h.db.chapter.findMany.mockResolvedValue([]);

    const res = await upload(TWO_CHAPTERS);

    expect(res.status).toBe(200);
    expect((await res.json()).chapters).toHaveLength(2);
  });
});
