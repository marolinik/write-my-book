// Review I2 (Wave 2): Indie now counts active books, so archiving frees a
// slot. Restoring took it back with no plan check, so archive, create,
// restore gave any number of active books on a 2-book plan.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  checkPlanAccess: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: { book: { findFirst: h.findFirst, updateMany: h.updateMany } } }));
vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: (...a: unknown[]) => h.checkPlanAccess(...a),
}));

import { POST } from "@/app/api/books/[id]/archive/route";

const call = (archived: boolean) =>
  POST(
    new NextRequest("http://t/api/books/b1/archive", {
      method: "POST",
      body: JSON.stringify({ archived }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: "b1" }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.updateMany.mockResolvedValue({ count: 1 });
  h.findFirst.mockResolvedValue({ id: "b1" });
  h.checkPlanAccess.mockResolvedValue({ allowed: true });
});

describe("POST /api/books/:id/archive", () => {
  it("refuses to restore a book past the plan's active-book limit", async () => {
    h.checkPlanAccess.mockResolvedValue({
      allowed: false,
      reason: "Your Indie Author plan allows 2 active books.",
      upgradeToTier: "professional",
    });
    const res = await call(false);
    expect(res.status).toBe(403);
    expect((await res.json()).upgradeToTier).toBe("professional");
    expect(h.checkPlanAccess).toHaveBeenCalledWith("u1", "restore_book");
    expect(h.updateMany).not.toHaveBeenCalled();
  });

  it("restores when the plan allows it", async () => {
    const res = await call(false);
    expect(res.status).toBe(200);
    expect(h.updateMany).toHaveBeenCalled();
  });

  it("archives without any plan check", async () => {
    const res = await call(true);
    expect(res.status).toBe(200);
    expect(h.checkPlanAccess).not.toHaveBeenCalled();
  });
});
