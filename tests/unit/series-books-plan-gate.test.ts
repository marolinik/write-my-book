import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * X-S19 / P7-S14 — "New Book" on a series screen bypassed the book cap.
 *
 * POST /api/books refuses a Free writer's second book (403 + upgradeToTier),
 * but POST /api/series/:id/books created one with no plan check at all: a
 * canceled writer went from 4 books to 5 with 201s. Creating a book through a
 * series is still creating a book — it must pass the same `create_book` gate.
 * Linking an EXISTING book into the series creates nothing and stays ungated.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  checkPlanAccess: vi.fn(),
  db: {
    series: { findFirst: vi.fn() },
    book: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: (...a: unknown[]) => h.checkPlanAccess(...a),
}));

import { POST } from "@/app/api/series/[id]/books/route";

const SERIES_ID = "11111111-1111-4111-8111-111111111111";
const BOOK_ID = "22222222-2222-4222-8222-222222222222";
const ctx = { params: Promise.resolve({ id: SERIES_ID }) };
const req = (body: unknown) =>
  new Request(`http://t/api/series/${SERIES_ID}/books`, {
    method: "POST",
    body: JSON.stringify(body),
  });

const FREE_DENIAL = {
  allowed: false,
  reason: "Free plan includes 1 book. Upgrade to Indie for 2 active books and unlimited AI runs.",
  upgradeToTier: "indie",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.series.findFirst.mockResolvedValue({ id: SERIES_ID, genre: null, language: "en" });
  h.db.book.findFirst.mockResolvedValue(null);
  h.db.book.create.mockResolvedValue({ id: "new-book", bookNumber: 1 });
  h.checkPlanAccess.mockResolvedValue({ allowed: true });
});

describe("POST /api/series/:id/books — new book passes the create_book gate", () => {
  it("403s with the plan copy + upgradeToTier and creates nothing when the cap is reached", async () => {
    h.checkPlanAccess.mockResolvedValue(FREE_DENIAL);
    const res = await POST(req({ name: "Book Five" }) as never, ctx as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: FREE_DENIAL.reason,
      upgradeToTier: "indie",
    });
    expect(h.checkPlanAccess).toHaveBeenCalledWith("u1", "create_book");
    expect(h.db.book.create).not.toHaveBeenCalled();
  });

  it("creates the book when the plan allows it", async () => {
    const res = await POST(req({ name: "Book Two" }) as never, ctx as never);
    expect(res.status).toBe(201);
    expect(h.checkPlanAccess).toHaveBeenCalledWith("u1", "create_book");
    expect(h.db.book.create).toHaveBeenCalledTimes(1);
  });

  it("does not gate linking an existing book (nothing is created)", async () => {
    h.checkPlanAccess.mockResolvedValue(FREE_DENIAL);
    h.db.book.findFirst
      .mockResolvedValueOnce(null) // last book number in the series
      .mockResolvedValueOnce({ id: BOOK_ID, seriesId: null }); // the book to link
    h.db.book.update.mockResolvedValue({ id: BOOK_ID, seriesId: SERIES_ID });
    const res = await POST(req({ bookId: BOOK_ID }) as never, ctx as never);
    expect(res.status).toBe(201);
    expect(h.checkPlanAccess).not.toHaveBeenCalled();
    expect(h.db.book.create).not.toHaveBeenCalled();
  });
});
