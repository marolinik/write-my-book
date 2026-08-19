import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// D-06: an actively-subscribed user must NOT be able to open a fresh Checkout
// session — completing it would create a second, parallel Stripe subscription
// (double billing). Plan changes go through the billing portal, which prorates
// the existing subscription.
const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sessionsCreate: vi.fn(),
  customersCreate: vi.fn(),
  db: {
    subscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing", () => ({
  stripe: {
    checkout: { sessions: { create: h.sessionsCreate } },
    customers: { create: h.customersCreate },
  },
  PLANS: {
    indie: {
      name: "Indie Author",
      trialDays: 14,
      stripePriceIds: { monthly: "price_indie_m", annual: "price_indie_a" },
    },
    professional: {
      name: "Professional",
      trialDays: 14,
      stripePriceIds: { monthly: "price_pro_m", annual: "price_pro_a" },
    },
  },
}));

import { POST } from "@/app/api/billing/checkout/route";

function req(body: unknown = { plan: "indie", billingInterval: "monthly" }) {
  return new NextRequest("http://t/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 7 * 24 * 3600 * 1000);

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1", email: "u1@test" });
  h.db.subscription.findUnique.mockResolvedValue(null);
  h.db.subscription.create.mockResolvedValue({ id: "s1" });
  h.db.subscription.update.mockResolvedValue({ id: "s1" });
  h.customersCreate.mockResolvedValue({ id: "cus_new" });
  h.sessionsCreate.mockResolvedValue({
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
  });
});

describe("POST /api/billing/checkout — double-subscribe guard (D-06)", () => {
  it("active subscription → 409, no Stripe session created", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "active",
      plan: "professional",
      stripeCustomerId: "cus_1",
      trialEnd: null,
    });

    const res = await POST(req());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already have an active subscription/i);
    expect(body.error).toMatch(/billing portal|manage subscription/i);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(h.customersCreate).not.toHaveBeenCalled();
  });

  it("past_due subscription → 409 (Stripe is still retrying payment on it)", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "past_due",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: null,
    });

    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("trialing with a live trial → 409", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "trialing",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: FUTURE,
    });

    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("trialing but trial already expired → checkout proceeds (mirrors plan-gating: treated as lapsed)", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "trialing",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: PAST,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("canceled subscription → checkout proceeds", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "canceled",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: null,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    // Existing customer is reused — no duplicate Stripe customer.
    expect(h.customersCreate).not.toHaveBeenCalled();
  });

  it("no subscription row → creates customer + sub row and proceeds", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.customersCreate).toHaveBeenCalledTimes(1);
    expect(h.db.subscription.create).toHaveBeenCalledTimes(1);
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/billing/checkout — card-free trial (A12 / D-52)", () => {
  it("first trial → payment_method_collection 'if_required' + trial block", async () => {
    // No prior subscription row → no prior trial → card-free trial offered.
    await POST(req());
    const cfg = h.sessionsCreate.mock.calls[0][0];
    expect(cfg.payment_method_collection).toBe("if_required");
    expect(cfg.subscription_data?.trial_period_days).toBe(14);
    expect(
      cfg.subscription_data?.trial_settings?.end_behavior?.missing_payment_method
    ).toBe("cancel");
  });

  it("one-trial-per-customer fence: a user who already had a trial is paid-from-day-1", async () => {
    // Canceled sub that retains trialEnd from a prior trial → no second trial.
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "canceled",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: PAST,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    const cfg = h.sessionsCreate.mock.calls[0][0];
    expect(cfg.subscription_data).toBeUndefined();
    expect(cfg.payment_method_collection).toBeUndefined();
  });
});
