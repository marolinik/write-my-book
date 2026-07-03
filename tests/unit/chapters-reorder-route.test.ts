import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn(), update: vi.fn() },
    document: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { PATCH } from "@/app/api/books/[id]/chapters/reorder/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };

// Two valid uuids for the two chapters under test.
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function req(body: unknown) {
  return new Request("http://t/api/books/b1/chapters/reorder", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// A well-formed swap: chapter A (was #1) → #2, chapter B (was #2) → #1.
const validOrder = [
  { chapterId: ID_A, chapterNumber: 2 },
  { chapterId: ID_B, chapterNumber: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.chapter.findMany.mockResolvedValue([
    { id: ID_A, chapterNumber: 1 },
    { id: ID_B, chapterNumber: 2 },
  ]);
  // update/updateMany just need to return something thenable-ish; the route
  // hands them to $transaction which we stub to resolve.
  h.db.chapter.update.mockImplementation((arg: unknown) => arg);
  h.db.document.updateMany.mockImplementation((arg: unknown) => arg);
  h.db.$transaction.mockResolvedValue([]);
});

describe("PATCH /api/books/:id/chapters/reorder", () => {
  it("401 when unauthenticated", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);
    expect(res.status).toBe(401);
  });

  it("400 on malformed / empty / duplicate input", async () => {
    // missing order
    expect(
      (await PATCH(req({}) as never, ctx as never)).status
    ).toBe(400);
    // empty order
    expect(
      (await PATCH(req({ order: [] }) as never, ctx as never)).status
    ).toBe(400);
    // chapterNumber < 1
    expect(
      (
        await PATCH(
          req({ order: [{ chapterId: ID_A, chapterNumber: 0 }] }) as never,
          ctx as never
        )
      ).status
    ).toBe(400);
    // non-uuid chapterId
    expect(
      (
        await PATCH(
          req({ order: [{ chapterId: "nope", chapterNumber: 1 }] }) as never,
          ctx as never
        )
      ).status
    ).toBe(400);
    // duplicate target chapterNumbers
    expect(
      (
        await PATCH(
          req({
            order: [
              { chapterId: ID_A, chapterNumber: 1 },
              { chapterId: ID_B, chapterNumber: 1 },
            ],
          }) as never,
          ctx as never
        )
      ).status
    ).toBe(400);
    // duplicate chapterIds
    expect(
      (
        await PATCH(
          req({
            order: [
              { chapterId: ID_A, chapterNumber: 1 },
              { chapterId: ID_A, chapterNumber: 2 },
            ],
          }) as never,
          ctx as never
        )
      ).status
    ).toBe(400);
  });

  it("404 when the book is not owned by the caller", async () => {
    h.db.book.findFirst.mockResolvedValueOnce(null);
    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);
    expect(res.status).toBe(404);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("404 when a chapterId does not belong to the book (foreign id rejected)", async () => {
    // Only one of the two requested chapters is found under this book.
    h.db.chapter.findMany.mockResolvedValueOnce([{ id: ID_A, chapterNumber: 1 }]);
    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);
    expect(res.status).toBe(404);
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });

  it("renumbers via two-phase temp offset inside ONE transaction and returns count", async () => {
    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reordered: 2 });

    // Exactly one transaction wraps the whole renumber.
    expect(h.db.$transaction).toHaveBeenCalledTimes(1);

    // Chapters: phase A parks at 10000+i, phase B writes finals.
    const chapterData = h.db.chapter.update.mock.calls.map(
      (c) => c[0].data.chapterNumber
    );
    // Phase A temp numbers 10000, 10001 present…
    expect(chapterData).toContain(10000);
    expect(chapterData).toContain(10001);
    // …and phase B finals 2, 1 present.
    expect(chapterData).toContain(2);
    expect(chapterData).toContain(1);

    // Every chapter.update targets a requested chapterId.
    for (const call of h.db.chapter.update.mock.calls) {
      expect([ID_A, ID_B]).toContain(call[0].where.id);
    }
  });

  it("renumbers the chapter_number of scoped documents but never the storageKey", async () => {
    await PATCH(req({ order: validOrder }) as never, ctx as never);

    // Documents are renumbered by (bookId, chapter_number) — old→temp→final.
    expect(h.db.document.updateMany).toHaveBeenCalled();
    for (const call of h.db.document.updateMany.mock.calls) {
      const { where, data } = call[0];
      expect(where.bookId).toBe("b1");
      // Only chapter_number moves; storageKey is never in the update payload.
      expect(Object.keys(data)).toEqual(["chapterNumber"]);
      expect(data).not.toHaveProperty("storageKey");
    }

    // Phase A keys off each chapter's OLD number (1 and 2), so those appear as
    // source `where.chapterNumber` values.
    const whereNumbers = h.db.document.updateMany.mock.calls.map(
      (c) => c[0].where.chapterNumber
    );
    expect(whereNumbers).toContain(1); // old number of chapter A
    expect(whereNumbers).toContain(2); // old number of chapter B
    expect(whereNumbers).toContain(10000); // temp source in phase B
  });
});
