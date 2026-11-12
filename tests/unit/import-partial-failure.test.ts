// P2-12: a structured import that failed on chapter k left 1..k-1 imported,
// chapter k's ROW carrying the new word count over its OLD prose, the book
// counters unreconciled, and a bare 500. Now each chapter's document is
// written before its row, the counters are reconciled whatever happens, and
// a failure says exactly which chapters were imported.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
  doc: { findByType: vi.fn(), update: vi.fn(), create: vi.fn() },
  reconcile: vi.fn(),
  indexBatch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.doc.findByType;
    update = h.doc.update;
    create = h.doc.create;
  },
}));
vi.mock("@/lib/books/book-counters", () => ({ reconcileBookCounters: (...a: unknown[]) => h.reconcile(...a) }));
vi.mock("@/lib/vector", () => ({ indexBatch: (...a: unknown[]) => h.indexBatch(...a) }));
vi.mock("@/lib/storage", () => ({ getBookStorage: () => ({ write: vi.fn() }) }));
vi.mock("@/lib/import-export/docx-to-markdown", () => ({ convertDocxToMarkdown: vi.fn() }));

import { POST } from "@/app/api/books/[id]/import/route";

const confirm = (body: unknown) =>
  POST(
    new Request("http://t/api/books/b1/import", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as never,
    { params: Promise.resolve({ id: "b1" }) }
  );

const row = (number: number) => ({ number, title: `T${number}`, content: `words of chapter ${number}`, action: "create" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.chapter.findMany.mockResolvedValue([]);
  h.db.chapter.upsert.mockResolvedValue({});
  h.doc.findByType.mockResolvedValue(null);
  h.doc.create.mockImplementation(async (_t: string, content: string) => {
    if (content.includes("chapter 2")) throw new Error("S3 PUT failed at minio:9000");
    return { id: "d" };
  });
  h.reconcile.mockResolvedValue({ chapterCount: 1, wordCount: 4 });
  h.indexBatch.mockResolvedValue({ indexed: 0, skipped: 0, failed: 0 });
});

describe("structured import, failing on chapter 2 of 3", () => {
  it("answers which chapters were imported, with a code the client can show", async () => {
    const res = await confirm({ actNumber: 1, chapters: [row(1), row(2), row(3)] });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ code: "IMPORT_PARTIAL", imported: [1] });
    expect(JSON.stringify(body)).not.toContain("minio");
  });

  it("never updates chapter 2's row, whose document failed", async () => {
    await confirm({ actNumber: 1, chapters: [row(1), row(2), row(3)] });
    const rowsWritten = h.db.chapter.upsert.mock.calls.map((c) => c[0].where.bookId_chapterNumber.chapterNumber);
    expect(rowsWritten).toEqual([1]);
  });

  it("reconciles the book counters even though it failed", async () => {
    await confirm({ actNumber: 1, chapters: [row(1), row(2), row(3)] });
    expect(h.reconcile).toHaveBeenCalledWith("b1");
  });
});
