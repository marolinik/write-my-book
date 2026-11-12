// P2-11: creating a book that collides with one of the writer's names, or with
// a book number already taken in the series, is a 409 the writer can act on,
// and the four writes of a book (row, settings, Chapter 1, prefix + count)
// either all land or none do.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const tx = {
    book: { create: vi.fn(), update: vi.fn() },
    bookSettings: { create: vi.fn() },
    chapter: { create: vi.fn() },
  };
  return {
    tx,
    db: {
      book: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      series: { findFirst: vi.fn() },
      bookSettings: { create: vi.fn() },
      chapter: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1", preferredLanguage: "en" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/plan-gating", () => ({ checkPlanAccess: async () => ({ allowed: true }) }));

import { POST } from "@/app/api/books/route";

const SERIES = "00000000-0000-4000-8000-000000000009";
const post = (body: unknown) =>
  POST(new NextRequest("http://test/api/books", { method: "POST", body: JSON.stringify(body) }));

function p2002(target: string[]) {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target } });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findFirst.mockResolvedValue(null);
  h.db.series.findFirst.mockResolvedValue({ id: SERIES });
  h.tx.book.create.mockResolvedValue({ id: "b1", bookNumber: 2 });
  h.tx.bookSettings.create.mockResolvedValue({});
  h.tx.chapter.create.mockResolvedValue({ id: "c1" });
  h.tx.book.update.mockResolvedValue({ id: "b1", name: "Two" });
});

describe("POST /api/books", () => {
  it("writes the book, its settings, Chapter 1 and the prefix inside one transaction", async () => {
    const res = await post({ name: "Two" });
    expect(res.status).toBe(201);
    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.book.create).toHaveBeenCalled();
    expect(h.tx.bookSettings.create).toHaveBeenCalled();
    expect(h.tx.chapter.create).toHaveBeenCalled();
    expect(h.tx.book.update).toHaveBeenCalled();
    expect(h.db.book.create).not.toHaveBeenCalled();
  });

  it("a name race (P2002 on user_id+name) is a 409, not a 500", async () => {
    h.tx.book.create.mockRejectedValue(p2002(["user_id", "name"]));
    const res = await post({ name: "Two" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "A book with this name already exists", code: "CONFLICT" });
  });

  it("a taken book number in the series is a 409 that names the number", async () => {
    h.tx.book.create.mockRejectedValue(p2002(["series_id", "book_number"]));
    const res = await post({ name: "Two", seriesId: SERIES, bookNumber: 2 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "This series already has a book with that number",
      code: "CONFLICT",
    });
  });

  it("a failure after the row is created propagates out of the transaction (no half-made book)", async () => {
    h.tx.chapter.create.mockRejectedValue(new Error("connection reset"));
    const res = await post({ name: "Two" });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("connection reset");
  });
});
