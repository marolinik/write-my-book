// tests/unit/billing-subscription-route.test.ts
// D-92(b): GET /api/billing/subscription wrapped the ENTIRE handler in one
// `try { ... } catch { 401 }`. Only requireUser() failing is a legitimate 401;
// a real DB/business error (db.subscription.findUnique, getFreeTierSnapshot
// reading free_tier_usage, Stripe) also landed in that catch and was returned
// as a false "Unauthorized". A Free writer whose snapshot throws saw a
// "you are not logged in" dead-end instead of an honest "something went wrong".
// These tests pin: (1) requireUser failure still 401; (2) a downstream failure
// is an honest 500, NOT 401.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  isFreeTier: vi.fn(),
  getFreeTierSnapshot: vi.fn(),
  db: {
    subscription: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing", () => ({
  stripe: null,
  PLANS: {},
  FREE_TIER: { name: "Free", maxBooks: 1 },
  isFreeTier: (...args: unknown[]) => h.isFreeTier(...args),
  getFreeTierSnapshot: (...args: unknown[]) => h.getFreeTierSnapshot(...args),
}));

import { GET } from "@/app/api/billing/subscription/route";

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  // Default happy path: Free writer, no stored subscription.
  h.db.subscription.findUnique.mockResolvedValue(null);
  h.isFreeTier.mockReturnValue(true);
  h.getFreeTierSnapshot.mockResolvedValue({ used: 0, limit: 10 });
  // Silence the honest server-side error log the 500 path emits.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/billing/subscription — honest failure states (D-92b)", () => {
  it("requireUser() rejection → 401 Unauthorized (unchanged)", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("happy path (authenticated Free writer) → 200 with snapshot", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("none");
    expect(body.freeTier).toEqual({ used: 0, limit: 10 });
  });

  it("db.subscription.findUnique throwing → 500, NOT 401", async () => {
    h.db.subscription.findUnique.mockRejectedValue(new Error("DB is down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toBe("Unauthorized");
  });

  it("getFreeTierSnapshot throwing (missing free_tier_usage table) → 500, NOT 401", async () => {
    // Authenticated Free writer, but the usage snapshot read blows up.
    h.getFreeTierSnapshot.mockRejectedValue(
      new Error('relation "free_tier_usage" does not exist')
    );
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).not.toBe("Unauthorized");
  });
});
