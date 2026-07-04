import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  checkPlanAccess: vi.fn(),
  db: {
    series: { findFirst: vi.fn() },
    book: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: (...args: unknown[]) => h.checkPlanAccess(...args),
}));

import { GET } from "@/app/api/series/[id]/analytics/route";

const ctx = { params: Promise.resolve({ id: "s1" }) };
function req() {
  return new Request("http://t/api/series/s1/analytics");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.series.findFirst.mockResolvedValue({ id: "s1", userId: "u1" });
  h.db.book.findMany.mockResolvedValue([]);
  h.checkPlanAccess.mockResolvedValue({ allowed: true });
});

describe("GET /api/series/:id/analytics — plan gating", () => {
  it("returns 200 when the plan allows analytics", async () => {
    const res = await GET(req() as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.checkPlanAccess).toHaveBeenCalledWith("u1", "use_analytics");
    const json = await res.json();
    expect(json.totals).toBeDefined();
  });

  it("returns 403 with no analytics data when the plan disallows it", async () => {
    h.checkPlanAccess.mockResolvedValue({
      allowed: false,
      reason: "Advanced analytics requires the Professional plan or higher.",
      upgradeToTier: "professional",
    });
    const res = await GET(req() as never, ctx as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("Professional");
    expect(json.books).toBeUndefined();
    expect(json.totals).toBeUndefined();
    // Gate short-circuits before the expensive analytics query runs.
    expect(h.db.book.findMany).not.toHaveBeenCalled();
  });

  it("404s (and never reaches the gate) when the series is not owned", async () => {
    h.db.series.findFirst.mockResolvedValue(null);
    const res = await GET(req() as never, ctx as never);
    expect(res.status).toBe(404);
    expect(h.checkPlanAccess).not.toHaveBeenCalled();
  });
});
