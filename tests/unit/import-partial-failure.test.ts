// P2-12 (Wave 7, D24): a structured import is all-or-nothing. A failure on
// chapter k undoes chapters 1..k-1 (updated documents go back to the version
// they had, created ones are deleted, rows get their old values back), the
// counters are reconciled, and the answer says nothing was changed. Only if an
// undo itself fails does the answer fall back to naming what stayed imported.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  doc: { findByType: vi.fn(), update: vi.fn(), create: vi.fn(), restoreVersion: vi.fn(), delete: vi.fn() },
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
    restoreVersion = h.doc.restoreVersion;
    delete = h.doc.delete;
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
  h.db.chapter.findUnique.mockResolvedValue(null);
  h.db.chapter.delete.mockResolvedValue({});
  h.db.chapter.update.mockResolvedValue({});
  h.doc.findByType.mockResolvedValue(null);
  h.doc.create.mockImplementation(async (_t: string, content: string) => {
    if (content.includes("chapter 2")) throw new Error("S3 PUT failed at minio:9000");
    return { id: `d-${content.slice(-1)}` };
  });
  h.doc.delete.mockResolvedValue(undefined);
  h.doc.restoreVersion.mockResolvedValue({});
  h.reconcile.mockResolvedValue({ chapterCount: 1, wordCount: 4 });
  h.indexBatch.mockResolvedValue({ indexed: 0, skipped: 0, failed: 0 });
});

describe("structured import, failing on chapter 2 of 3", () => {
  it("undoes chapter 1 and says nothing was changed", async () => {
    const res = await confirm({ actNumber: 1, chapters: [row(1), row(2), row(3)] });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ code: "IMPORT_ROLLED_BACK", imported: [] });
    expect(JSON.stringify(body)).not.toContain("minio");
    // Chapter 1 was new: its document is deleted and its row removed.
    expect(h.doc.delete).toHaveBeenCalledWith("d-1");
    expect(h.db.chapter.delete).toHaveBeenCalledWith({ where: { bookId_chapterNumber: { bookId: "b1", chapterNumber: 1 } } });
  });

  it("an existing chapter goes back to its previous version and row values", async () => {
    h.doc.findByType.mockImplementation(async (_t: string, n: number) => (n === 1 ? { id: "doc1", currentVersion: 4 } : null));
    h.db.chapter.findUnique.mockImplementation(async ({ where }: { where: { bookId_chapterNumber: { chapterNumber: number } } }) =>
      where.bookId_chapterNumber.chapterNumber === 1
        ? { title: "Old", wordCount: 900, status: "drafted", importedAt: null }
        : null
    );
    await confirm({ actNumber: 1, chapters: [row(1), row(2)] });
    expect(h.doc.restoreVersion).toHaveBeenCalledWith("doc1", 4);
    expect(h.db.chapter.update).toHaveBeenCalledWith({
      where: { bookId_chapterNumber: { bookId: "b1", chapterNumber: 1 } },
      data: { title: "Old", wordCount: 900, status: "drafted", importedAt: null },
    });
  });

  it("never touches chapter 2's row, whose document failed, and reconciles the counters", async () => {
    await confirm({ actNumber: 1, chapters: [row(1), row(2), row(3)] });
    const rowsWritten = h.db.chapter.upsert.mock.calls.map((c) => c[0].where.bookId_chapterNumber.chapterNumber);
    expect(rowsWritten).toEqual([1]);
    expect(h.reconcile).toHaveBeenCalledWith("b1");
  });

  it("if an undo fails too, it names what stayed imported", async () => {
    h.doc.delete.mockRejectedValue(new Error("s3 down"));
    const res = await confirm({ actNumber: 1, chapters: [row(1), row(2), row(3)] });
    expect(await res.json()).toMatchObject({ code: "IMPORT_PARTIAL", imported: [1] });
  });
});
