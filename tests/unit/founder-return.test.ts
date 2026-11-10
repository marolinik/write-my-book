// P1-7 / D4: the Founder price is "locked in forever", and a Founder keeps
// their slot through a lapse. Checkout refused every slot holder ("You
// already have a Founder slot"), so a card failure lost the price for good.
// A lapsed Founder can now subscribe again, even after all slots are gone,
// and the purchase is granted on the slot they already hold.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sessionsCreate: vi.fn(),
  db: {
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
    user: { findUnique: vi.fn() },
    founderSlot: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    subscription: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/billing", () => ({
  stripe: {
    checkout: { sessions: { create: h.sessionsCreate, retrieve: vi.fn(), expire: vi.fn() } },
    subscriptions: { retrieve: vi.fn() },
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
  },
  PLANS: {
    founder: { name: "Founder", trialDays: 0, maxSlots: 200, stripePriceIds: { monthly: "price_founder_m" } },
  },
}));
vi.mock("@/lib/billing/stripe-client", () => ({
  PLANS: { founder: { maxSlots: 200 } },
}));

import { POST } from "@/app/api/billing/checkout/route";
import { applyCompletedCheckout } from "@/lib/billing/apply-checkout";

const LAPSED_FOUNDER = {
  id: "s1",
  userId: "u1",
  plan: "founder",
  status: "canceled",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_old",
  pendingCheckoutSessionId: null,
  trialEnd: null,
};

function checkoutReq() {
  return new NextRequest("http://t/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan: "founder", billingInterval: "monthly" }),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1", email: "u1@test" });
  h.db.$executeRaw.mockResolvedValue([]);
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.db));
  h.db.subscription.findUnique.mockResolvedValue(LAPSED_FOUNDER);
  h.db.subscription.update.mockResolvedValue({ id: "s1" });
  h.db.subscription.upsert.mockResolvedValue({});
  h.db.subscription.findFirst.mockResolvedValue({ stripeSubscriptionId: "sub_old" });
  h.db.user.findUnique.mockResolvedValue({ id: "u1" });
  h.db.founderSlot.count.mockResolvedValue(200);
  h.sessionsCreate.mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.com/c/pay/cs_new" });
});

describe("a lapsed Founder", () => {
  it("can open a Founder checkout after every slot is claimed", async () => {
    h.db.founderSlot.findUnique.mockResolvedValue({ userId: "u1" });
    const res = await POST(checkoutReq());
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain("cs_new");
  });

  it("is granted on the slot they hold, with no second slot", async () => {
    h.db.founderSlot.findUnique.mockResolvedValue({ userId: "u1" });
    const stripe = {
      subscriptions: {
        // The old Founder subscription lapsed; the new one is live.
        retrieve: vi.fn(async (id: string) => ({
          id,
          status: id === "sub_old" ? "canceled" : "active",
          items: { data: [] },
        })),
      },
    } as unknown as Stripe;
    const session = {
      id: "cs_new",
      payment_status: "paid",
      subscription: "sub_new",
      customer: "cus_1",
      metadata: { userId: "u1", plan: "founder", billingInterval: "monthly" },
    } as unknown as Stripe.Checkout.Session;

    const result = await applyCompletedCheckout(stripe, session);
    expect(result).toEqual({ kind: "applied" });
    expect(h.db.founderSlot.create).not.toHaveBeenCalled();
    expect(h.db.subscription.upsert.mock.calls[0][0].update.plan).toBe("founder");
  });
});

describe("a writer who never held a slot", () => {
  it("is still told the Founder spots are full", async () => {
    h.db.subscription.findUnique.mockResolvedValue({ ...LAPSED_FOUNDER, plan: "indie" });
    h.db.founderSlot.findUnique.mockResolvedValue(null);
    const res = await POST(checkoutReq());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/full/);
  });
});
