import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), update: vi.fn() },
    chapter: { findMany: vi.fn(), update: vi.fn() },
  },
  findByType: vi.fn(),
  readPinned: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
    update = h.update;
  },
}));

import { POST } from "@/app/api/books/[id]/search/replace/route";
const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/search/replace", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.chapter.findMany.mockResolvedValue([]);
  h.db.chapter.update.mockResolvedValue({});
  h.db.book.update.mockResolvedValue({});
  // svc.update returns { version: { version } }
  h.update.mockImplementation(() =>
    Promise.resolve({ version: { version: 7 } })
  );
});

describe("POST /api/books/:id/search/replace", () => {
  it("401 / 400 / 404 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect(
      (await POST(req({ find: "Bob", replace: "Al" }) as never, ctx as never))
        .status
    ).toBe(401);

    // find too short → 400
    expect(
      (await POST(req({ find: "B", replace: "Al" }) as never, ctx as never))
        .status
    ).toBe(400);
    // missing replace → 400
    expect(
      (await POST(req({ find: "Bob" }) as never, ctx as never)).status
    ).toBe(400);

    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect(
      (await POST(req({ find: "Bob", replace: "Al" }) as never, ctx as never))
        .status
    ).toBe(404);
  });

  it("fences book lookup to {id,userId}", async () => {
    await POST(req({ find: "Bob", replace: "Al" }) as never, ctx as never);
    expect(h.db.book.findFirst.mock.calls[0][0].where).toEqual({
      id: "b1",
      userId: "u1",
    });
  });

  it("replaces across chapters, saves via DocumentService, returns counts", async () => {
    h.db.chapter.findMany.mockResolvedValueOnce([
      { id: "c1", chapterNumber: 1, wordCount: 3 },
      { id: "c2", chapterNumber: 2, wordCount: 2 },
      { id: "c3", chapterNumber: 3, wordCount: 5 }, // no matches → skipped
    ]);
    h.findByType.mockImplementation((_t: unknown, n: number) =>
      Promise.resolve({ id: `doc${n}` })
    );
    h.readPinned.mockImplementation((docId: string) => {
      if (docId === "doc1")
        return Promise.resolve({ content: "Bob and Bob" });
      if (docId === "doc2") return Promise.resolve({ content: "Bob here" });
      return Promise.resolve({ content: "nothing to change" });
    });

    const res = await POST(
      req({ find: "Bob", replace: "Alice" }) as never,
      ctx as never
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalReplacements).toBe(3);
    expect(body.replaced).toEqual([
      { chapterId: "c1", count: 2, newVersion: 7 },
      { chapterId: "c2", count: 1, newVersion: 7 },
    ]);

    // Only the two changed chapters were saved (c3 skipped → no version churn).
    expect(h.update).toHaveBeenCalledTimes(2);
    const firstUpdate = h.update.mock.calls[0];
    expect(firstUpdate[0]).toBe("doc1");
    expect(firstUpdate[1]).toBe("Alice and Alice");
    expect(firstUpdate[3]).toBe("find_replace");
    expect(firstUpdate[4]).toBe("user");
    expect(h.db.chapter.update).toHaveBeenCalledTimes(2);
  });

  it("chapterIds scopes findMany to the given chapters within the book", async () => {
    await POST(
      req({ find: "Bob", replace: "Al", chapterIds: ["c2"] }) as never,
      ctx as never
    );
    expect(h.db.chapter.findMany.mock.calls[0][0].where).toEqual({
      bookId: "b1",
      id: { in: ["c2"] },
    });
  });

  it("absent chapterIds targets the whole book (no id filter)", async () => {
    await POST(req({ find: "Bob", replace: "Al" }) as never, ctx as never);
    expect(h.db.chapter.findMany.mock.calls[0][0].where).toEqual({
      bookId: "b1",
    });
  });
});
