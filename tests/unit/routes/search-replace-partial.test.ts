// P2-13: a book-wide replace that fails on chapter k keeps chapters 1..k-1
// replaced (each is its own versioned save), so the writer must be told which
// ones, and the book's word total must be recomputed from the chapter rows
// whether the run finished or not. chapterIds is bounded and typed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: {
    book: { findFirst: vi.fn(), update: vi.fn() },
    chapter: { findMany: vi.fn(), update: vi.fn() },
  },
  findByType: vi.fn(),
  readPinned: vi.fn(),
  update: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/books/book-counters", () => ({ reconcileBookCounters: h.reconcile }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
    update = h.update;
  },
}));

import { POST } from "@/app/api/books/[id]/search/replace/route";

const BOOK = "00000000-0000-4000-8000-000000000001";
const C = (n: number) => `00000000-0000-4000-8000-00000000010${n}`;
const call = (body: unknown) =>
  POST(
    new NextRequest(`http://test/api/books/${BOOK}/search/replace`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: BOOK }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.db.book.findFirst.mockResolvedValue({ id: BOOK });
  h.db.chapter.findMany.mockResolvedValue([1, 2, 3].map((n) => ({ id: C(n), chapterNumber: n, wordCount: 3 })));
  h.findByType.mockImplementation(async (_t: string, n: number) => ({ id: `doc${n}` }));
  h.readPinned.mockResolvedValue({ content: "the old door" });
  h.update.mockImplementation(async (id: string) => {
    if (id === "doc2") throw new Error("S3 PUT timed out at minio:9000");
    return { version: { version: 7 } };
  });
  h.reconcile.mockResolvedValue({ wordCount: 9, chapterCount: 3 });
});

describe("POST /api/books/:id/search/replace", () => {
  it("on a mid-run failure, answers which chapters were replaced and reconciles the counters", async () => {
    const res = await call({ find: "old", replace: "new" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Replace failed", partial: true, totalReplacements: 1 });
    expect(body.replaced).toEqual([{ chapterId: C(1), count: 1, newVersion: 7 }]);
    expect(JSON.stringify(body)).not.toContain("minio");
    expect(h.reconcile).toHaveBeenCalledWith(BOOK);
    // No delta increment: the total comes from the rows.
    expect(h.db.book.update).not.toHaveBeenCalled();
  });

  it("a full run reconciles too", async () => {
    h.update.mockResolvedValue({ version: { version: 2 } });
    const res = await call({ find: "old", replace: "new" });
    expect(res.status).toBe(200);
    expect((await res.json()).totalReplacements).toBe(3);
    expect(h.reconcile).toHaveBeenCalledWith(BOOK);
  });

  it.each([
    ["a non-uuid chapter id", { chapterIds: ["chapter-one"] }],
    ["more than 999 chapter ids", { chapterIds: Array.from({ length: 1000 }, () => C(1)) }],
  ])("refuses %s", async (_n, extra) => {
    const res = await call({ find: "old", replace: "new", ...extra });
    expect(res.status).toBe(400);
    expect(h.db.chapter.findMany).not.toHaveBeenCalled();
  });
});
