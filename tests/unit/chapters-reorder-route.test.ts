import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Review of a07a2f2: the route read each chapter's number OUTSIDE its
 * transaction and moved documents by those numbers inside it. A structural move
 * or a second tab that renumbered the book in between made those numbers stale,
 * and the drag carried one chapter's prose and briefs onto another. The
 * renumber now runs on an interactive transaction that takes the book's chapter
 * lock first and reads every number under it.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  /** The chapters the book holds when the transaction reads it, under the lock. */
  bookChapters: [] as Array<{ id: string; chapterNumber: number }>,
  statements: [] as Array<{ sql: string; values: unknown[] }>,
  db: {
    book: { findFirst: vi.fn() },
    chapter: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

/** The transaction client: every raw statement is recorded, in order. */
function fakeTx() {
  return {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.statements.push({ sql: strings.join("?"), values });
      return 1;
    }),
    chapter: {
      findMany: vi.fn(async () => h.bookChapters.map((c) => ({ ...c }))),
    },
  };
}

const updates = () => h.statements.filter((s) => /^\s*UPDATE/i.test(s.sql));

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
  h.bookChapters = [
    { id: ID_A, chapterNumber: 1 },
    { id: ID_B, chapterNumber: 2 },
  ];
  h.statements = [];
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(fakeTx()));
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

  it("renumbers inside ONE transaction that takes the book's chapter lock first", async () => {
    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ reordered: 2 });

    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
    const [fn, options] = h.db.$transaction.mock.calls[0];
    expect(typeof fn).toBe("function");
    // A long book must not be cut off by Prisma's 5 s default (P6-S10).
    expect(options.timeout).toBeGreaterThan(5000);

    // The lock comes before anything is read or written, keyed by a bound value.
    expect(h.statements[0].sql).toMatch(/pg_advisory_xact_lock/);
    expect(h.statements[0].values).toEqual(["wmb-chapters:b1"]);

    // Chapters reach their final numbers: A (was 1) -> 2, B (was 2) -> 1.
    const final = updates().find((s) => /UPDATE\s+chapters/i.test(s.sql) && /target/.test(s.sql));
    expect(final?.values).toEqual(expect.arrayContaining([[ID_A, ID_B], [2, 1]]));
  });

  it("moves scoped documents by the numbers read under the lock, never the storageKey", async () => {
    // The route's own check saw A at 1 and B at 2; by the time the lock was
    // granted, another tab had swapped them.
    h.bookChapters = [
      { id: ID_A, chapterNumber: 2 },
      { id: ID_B, chapterNumber: 1 },
    ];

    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);
    expect(res.status).toBe(200);

    const parkDocs = updates().find((s) => /UPDATE\s+documents/i.test(s.sql) && /old_number/.test(s.sql));
    // Documents follow each chapter from the number it holds NOW.
    expect(parkDocs?.values[0]).toEqual([2, 1]);
    for (const s of h.statements) expect(s.sql).not.toMatch(/storage_key/i);
  });

  it("409 when the book holds a chapter the ordering does not place (the view was stale)", async () => {
    // A split in another tab added a chapter the dragged view never saw.
    h.bookChapters = [
      { id: ID_A, chapterNumber: 1 },
      { id: ID_B, chapterNumber: 2 },
      { id: "33333333-3333-4333-8333-333333333333", chapterNumber: 3 },
    ];

    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);

    expect(res.status).toBe(409);
    expect(updates()).toEqual([]);
  });

  it("409 when a chapter left the book between the check and the transaction", async () => {
    h.bookChapters = [{ id: ID_A, chapterNumber: 1 }];

    const res = await PATCH(req({ order: validOrder }) as never, ctx as never);

    expect(res.status).toBe(409);
    expect(updates()).toEqual([]);
  });
});
