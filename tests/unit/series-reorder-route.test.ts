import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P3-S08 — reordering books in a series answered 500 on every adjacent move.
 *
 * The route shifted the neighbours by one while the moving book still held its
 * old number, so the first shifted neighbour landed on it. (series_id,
 * book_number) is a plain unique index, which Postgres checks row by row:
 * "duplicate key value violates unique constraint books_series_id_book_number_key".
 * The up/down arrows can only ask for adjacent moves, so the feature never
 * worked from its own UI.
 *
 * The fake below applies each updateMany row by row in ascending order and
 * refuses a number another book of the series still holds — the same check the
 * database makes.
 */

interface BookRow {
  id: string;
  seriesId: string;
  bookNumber: number;
}

type NumberFilter = { gt?: number; gte?: number; lt?: number; lte?: number };

const h = vi.hoisted(() => ({
  books: [] as Array<{ id: string; seriesId: string; bookNumber: number }>,
  requireUser: vi.fn(),
}));

function inRange(n: number, f: NumberFilter | number | undefined): boolean {
  if (f === undefined) return true;
  if (typeof f === "number") return n === f;
  return (
    (f.gt === undefined || n > f.gt) &&
    (f.gte === undefined || n >= f.gte) &&
    (f.lt === undefined || n < f.lt) &&
    (f.lte === undefined || n <= f.lte)
  );
}

function place(row: BookRow, to: number) {
  const clash = h.books.find(
    (b) => b !== row && b.seriesId === row.seriesId && b.bookNumber === to
  );
  if (clash) {
    const e = new Error(
      'duplicate key value violates unique constraint "books_series_id_book_number_key"'
    );
    (e as Error & { code?: string }).code = "P2002";
    throw e;
  }
  row.bookNumber = to;
}

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => {
  const book = {
    findFirst: async ({ where }: { where: { id: string; seriesId: string } }) => {
      const b = h.books.find((x) => x.id === where.id && x.seriesId === where.seriesId);
      return b ? { ...b } : null;
    },
    findMany: async ({ where }: { where: { seriesId: string } }) =>
      h.books
        .filter((b) => b.seriesId === where.seriesId)
        .sort((a, b) => a.bookNumber - b.bookNumber)
        .map((b) => ({ ...b })),
    updateMany: async ({
      where,
      data,
    }: {
      where: { seriesId: string; bookNumber?: NumberFilter; id?: { not: string } };
      data: { bookNumber: { increment?: number; decrement?: number } };
    }) => {
      const hits = h.books
        .filter(
          (b) =>
            b.seriesId === where.seriesId &&
            inRange(b.bookNumber, where.bookNumber) &&
            (!where.id || b.id !== where.id.not)
        )
        .sort((a, b) => a.bookNumber - b.bookNumber);
      const delta = (data.bookNumber.increment ?? 0) - (data.bookNumber.decrement ?? 0);
      for (const row of hits) place(row, row.bookNumber + delta);
      return { count: hits.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: { bookNumber: number } }) => {
      const row = h.books.find((b) => b.id === where.id)!;
      place(row, data.bookNumber);
      return { ...row };
    },
  };
  const db = {
    series: { findFirst: async () => ({ id: "s1", userId: "u1" }) },
    book,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const snap = structuredClone(h.books);
      try {
        return await fn({ book });
      } catch (e) {
        h.books = snap;
        throw e;
      }
    },
  };
  return { db };
});

import { POST } from "@/app/api/series/[id]/books/[bookId]/reorder/route";

function seed(numbers: number[]) {
  h.books = numbers.map((n, i) => ({
    id: String.fromCharCode(65 + i),
    seriesId: "s1",
    bookNumber: n,
  }));
}

async function move(bookId: string, newBookNumber: number) {
  const req = new Request("http://t/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newBookNumber }),
  });
  return POST(req as never, { params: Promise.resolve({ id: "s1", bookId }) } as never);
}

/** Book ids in series order. */
const order = () =>
  [...h.books].sort((a, b) => a.bookNumber - b.bookNumber).map((b) => `${b.id}${b.bookNumber}`);

beforeEach(() => {
  h.requireUser.mockResolvedValue({ id: "u1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/series/:id/books/:bookId/reorder", () => {
  it("moves the last book up one (#3 -> #2)", async () => {
    seed([1, 2, 3]);
    const res = await move("C", 2);
    expect(res.status).toBe(200);
    expect(order()).toEqual(["A1", "C2", "B3"]);
  });

  it("moves the first book down one (#1 -> #2)", async () => {
    seed([1, 2, 3]);
    const res = await move("A", 2);
    expect(res.status).toBe(200);
    expect(order()).toEqual(["B1", "A2", "C3"]);
  });

  it("moves across several books either way", async () => {
    seed([1, 2, 3, 4]);
    expect((await move("D", 1)).status).toBe(200);
    expect(order()).toEqual(["D1", "A2", "B3", "C4"]);

    expect((await move("D", 4)).status).toBe(200);
    expect(order()).toEqual(["A1", "B2", "C3", "D4"]);
  });

  it("leaves books outside the moved range alone, gaps included", async () => {
    seed([1, 2, 5, 7]);
    expect((await move("C", 1)).status).toBe(200);
    expect(order()).toEqual(["C1", "A2", "B3", "D7"]);
  });

  it("is a no-op when the number does not change", async () => {
    seed([1, 2, 3]);
    expect((await move("B", 2)).status).toBe(200);
    expect(order()).toEqual(["A1", "B2", "C3"]);
  });
});
