import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn() },
  },
  findByType: vi.fn(),
  readPinned: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
  },
}));

import { GET } from "@/app/api/books/[id]/search/route";
const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(qs: string) {
  return new Request(`http://t/api/books/b1/search${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.chapter.findMany.mockResolvedValue([]);
});

describe("GET /api/books/:id/search", () => {
  it("401 / 400 / 404 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await GET(req("?q=cat") as never, ctx as never)).status).toBe(401);

    // q too short (< 2 chars) → 400
    expect((await GET(req("?q=a") as never, ctx as never)).status).toBe(400);
    // missing q → 400
    expect((await GET(req("") as never, ctx as never)).status).toBe(400);

    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await GET(req("?q=cat") as never, ctx as never)).status).toBe(404);
  });

  it("fences book lookup to {id,userId}", async () => {
    await GET(req("?q=cat") as never, ctx as never);
    expect(h.db.book.findFirst.mock.calls[0][0].where).toEqual({
      id: "b1",
      userId: "u1",
    });
  });

  it("counts hits across multiple chapters and shapes snippets", async () => {
    h.db.chapter.findMany.mockResolvedValueOnce([
      { id: "c1", chapterNumber: 1, title: "One" },
      { id: "c2", chapterNumber: 2, title: "Two" },
      { id: "c3", chapterNumber: 3, title: "Empty" },
    ]);
    h.findByType.mockImplementation((_t: unknown, n: number) =>
      n === 3 ? null : Promise.resolve({ id: `doc${n}` })
    );
    h.readPinned.mockImplementation((docId: string) => {
      if (docId === "doc1")
        return Promise.resolve({ content: "The cat sat. A cat ran." });
      if (docId === "doc2") return Promise.resolve({ content: "one cat here" });
      return Promise.resolve({ content: "" });
    });

    const res = await GET(req("?q=cat") as never, ctx as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalCount).toBe(3);
    expect(body.hits).toHaveLength(2); // c3 has no doc → excluded
    expect(body.hits[0]).toMatchObject({
      chapterId: "c1",
      chapterNumber: 1,
      title: "One",
      count: 2,
    });
    expect(body.hits[0].snippets[0]).toEqual({
      before: "The ",
      match: "cat",
      after: " sat. A cat ran.",
    });
    expect(body.hits[1]).toMatchObject({ chapterId: "c2", count: 1 });
  });

  it("caseSensitive=1 narrows matches", async () => {
    h.db.chapter.findMany.mockResolvedValueOnce([
      { id: "c1", chapterNumber: 1, title: "One" },
    ]);
    h.findByType.mockResolvedValue({ id: "doc1" });
    h.readPinned.mockResolvedValue({ content: "Cat cat CAT" });

    const res = await GET(req("?q=cat&caseSensitive=1") as never, ctx as never);
    const body = await res.json();
    expect(body.totalCount).toBe(1);
  });
});
