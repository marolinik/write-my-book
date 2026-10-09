import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase C — GET /api/books/:id/structure/book-map: the book's
 * shape for the writer's book map. Numbers only: no chapter text leaves.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn() },
    chapterHookRating: { findMany: vi.fn() },
  },
  getAnalysisReport: vi.fn(),
  findByType: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/reports/analysis-report", () => ({ getAnalysisReport: h.getAnalysisReport }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.findByType;
    read = h.read;
  },
}));

import { GET } from "@/app/api/books/[id]/structure/book-map/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
const w = (n: number, word: string) => Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.chapter.findMany.mockResolvedValue([
    { id: "c1", chapterNumber: 1, title: "Zakletva" },
    { id: "c2", chapterNumber: 2, title: "Pustinja" },
  ]);
  h.findByType.mockImplementation(async (_t: string, n: number) => ({ id: `d${n}` }));
  h.read.mockImplementation(async (id: string) => ({ content: id === "d1" ? w(800, "a") : w(2400, "b") }));
  h.getAnalysisReport.mockResolvedValue({ pacing: [{ chapter: 2, tension: 4 }] });
  h.db.chapterHookRating.findMany.mockResolvedValue([{ chapterId: "c1", opening: 1, ending: 3, note: "Kraj vuče." }]);
});

describe("GET book map", () => {
  it("404s on someone else's book", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("http://t") as never, ctx as never);
    expect(res.status).toBe(404);
  });

  it("returns each chapter's numbers, tension and hooks, and no prose", async () => {
    const res = await GET(new Request("http://t") as never, ctx as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.medianWords).toBe(1600);
    expect(body.chapters).toHaveLength(2);
    expect(body.chapters[0]).toMatchObject({ chapterNumber: 1, words: 800, tension: null, hook: { opening: 1, ending: 3 } });
    expect(body.chapters[1]).toMatchObject({ chapterNumber: 2, words: 2400, tension: 4, hook: null });
    expect(JSON.stringify(body)).not.toContain("a0 a1");
  });
});
