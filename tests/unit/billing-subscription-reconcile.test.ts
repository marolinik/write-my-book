// P1-6: a writer who paid while the webhook was failing came back to
// "You're on the Free plan". GET /subscription now settles a completed
// pending checkout before answering.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findUnique: vi.fn(),
  reconcile: vi.fn(),
  stripe: { subscriptions: { retrieve: vi.fn() } },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: { subscription: { findUnique: h.findUnique, update: vi.fn() } } }));
vi.mock("@/lib/billing", () => ({
  stripe: h.stripe,
  PLANS: { indie: { name: "Indie Author", stripePriceIds: { monthly: "price_indie_m" } } },
  FREE_TIER: { name: "Free", maxBooks: 1 },
  isFreeTier: (sub: { plan?: string } | null) => !sub || sub.plan === "none",
  getFreeTierSnapshot: vi.fn().mockResolvedValue({ used: 0, limit: 10 }),
}));
vi.mock("@/lib/billing/apply-checkout", () => ({
  reconcilePendingCheckout: (...args: unknown[]) => h.reconcile(...args),
}));

import { GET } from "@/app/api/billing/subscription/route";

const PENDING = {
  id: "s1",
  userId: "u1",
  plan: "none",
  status: "none",
  pendingCheckoutSessionId: "cs_1",
  stripeSubscriptionId: null,
  stripeCustomerId: "cus_1",
  cancelAtPeriodEnd: false,
  trialEnd: null,
  updatedAt: new Date(),
};
const APPLIED = { ...PENDING, plan: "indie", status: "active", pendingCheckoutSessionId: null, stripeSubscriptionId: "sub_1" };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
});

describe("GET /api/billing/subscription — pending checkout self-heal", () => {
  it("applies a completed checkout the webhook never delivered and answers with the paid plan", async () => {
    h.findUnique.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(APPLIED);
    h.reconcile.mockResolvedValue(true);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(h.reconcile).toHaveBeenCalledWith(h.stripe, "u1");
    expect((await res.json()).plan).toBe("indie");
  });

  it("does not call Stripe for a row the webhook already recorded", async () => {
    h.findUnique.mockResolvedValue(APPLIED);
    await GET();
    expect(h.reconcile).not.toHaveBeenCalled();
  });
});
