// P1-6 / P2-7: one shared applyCompletedCheckout for the webhook and the
// self-heal path. Stripe decides the stored status (a past_due subscription is
// not "active"), an unpaid async checkout grants nothing, period fields are
// written, and a paid checkout whose webhook never arrived is applied when
// the writer comes back.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({
  db: {
    user: { findUnique: vi.fn() },
    subscription: { upsert: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
  claimFounderSlot: vi.fn(),
  cancelStripeSubscription: vi.fn(),
  subscriptionIsLive: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/billing/founder-slots", () => ({ claimFounderSlot: h.claimFounderSlot }));
vi.mock("@/lib/billing/stripe-cancel", () => ({
  cancelStripeSubscription: h.cancelStripeSubscription,
  subscriptionIsLive: h.subscriptionIsLive,
}));

import { applyCompletedCheckout, reconcilePendingCheckout } from "@/lib/billing/apply-checkout";

const PERIOD_START = 1_790_000_000;
const PERIOD_END = 1_792_600_000;

function stripeSub(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status,
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ current_period_start: PERIOD_START, current_period_end: PERIOD_END }] },
    ...extra,
  };
}

function session(extra: Record<string, unknown> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_1",
    status: "complete",
    payment_status: "paid",
    subscription: "sub_1",
    customer: "cus_1",
    metadata: { userId: "u1", plan: "indie", billingInterval: "monthly" },
    ...extra,
  } as unknown as Stripe.Checkout.Session;
}

function client(sub: unknown, checkoutSession?: unknown) {
  return {
    subscriptions: { retrieve: vi.fn().mockResolvedValue(sub) },
    checkout: { sessions: { retrieve: vi.fn().mockResolvedValue(checkoutSession) } },
  } as unknown as Stripe;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.user.findUnique.mockResolvedValue({ id: "u1" });
  h.db.subscription.findFirst.mockResolvedValue(null);
  h.db.subscription.upsert.mockResolvedValue({});
  h.claimFounderSlot.mockResolvedValue("granted");
});

describe("applyCompletedCheckout", () => {
  it("grants nothing for a checkout whose payment has not cleared", async () => {
    const result = await applyCompletedCheckout(client(stripeSub("incomplete")), session({ payment_status: "unpaid" }));
    expect(result).toEqual({ kind: "unpaid" });
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("stores the status Stripe reports, not a hardcoded active", async () => {
    const result = await applyCompletedCheckout(client(stripeSub("past_due")), session());
    expect(result).toEqual({ kind: "applied" });
    const call = h.db.subscription.upsert.mock.calls[0][0];
    expect(call.update.status).toBe("past_due");
    expect(call.create.status).toBe("past_due");
  });

  it("writes the billing period from the subscription", async () => {
    await applyCompletedCheckout(client(stripeSub("active")), session());
    const call = h.db.subscription.upsert.mock.calls[0][0];
    expect(call.create.currentPeriodStart).toEqual(new Date(PERIOD_START * 1000));
    expect(call.create.currentPeriodEnd).toEqual(new Date(PERIOD_END * 1000));
    expect(call.update.pendingCheckoutSessionId).toBeNull();
  });

  it("applies a checkout that needed no payment (a trial) as trialing", async () => {
    const trialEnd = PERIOD_END;
    await applyCompletedCheckout(
      client(stripeSub("trialing", { trial_end: trialEnd })),
      session({ payment_status: "no_payment_required" })
    );
    const call = h.db.subscription.upsert.mock.calls[0][0];
    expect(call.create.status).toBe("trialing");
    expect(call.create.trialEnd).toEqual(new Date(trialEnd * 1000));
  });
});

describe("reconcilePendingCheckout", () => {
  it("applies a paid checkout whose webhook never arrived", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      userId: "u1",
      status: "none",
      pendingCheckoutSessionId: "cs_1",
      stripeSubscriptionId: null,
    });
    const applied = await reconcilePendingCheckout(client(stripeSub("active"), session()), "u1");
    expect(applied).toBe(true);
    expect(h.db.subscription.upsert.mock.calls[0][0].create.plan).toBe("indie");
  });

  it("leaves a row the webhook already recorded alone", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      userId: "u1",
      pendingCheckoutSessionId: null,
      stripeSubscriptionId: "sub_1",
    });
    const stripe = client(stripeSub("active"), session());
    expect(await reconcilePendingCheckout(stripe, "u1")).toBe(false);
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it("applies it for a writer who had a subscription before (review I1: lapsed Founder, ended trial)", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      userId: "u1",
      plan: "founder",
      status: "canceled",
      trialEnd: null,
      pendingCheckoutSessionId: "cs_1",
      stripeSubscriptionId: "sub_old",
    });
    h.db.subscription.findFirst.mockResolvedValue({ stripeSubscriptionId: "sub_old" });
    h.subscriptionIsLive.mockResolvedValue(false);
    const applied = await reconcilePendingCheckout(client(stripeSub("active"), session()), "u1");
    expect(applied).toBe(true);
    expect(h.db.subscription.upsert.mock.calls[0][0].update.stripeSubscriptionId).toBe("sub_1");
  });

  it("leaves a live subscription alone even with a pending checkout", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      userId: "u1",
      plan: "indie",
      status: "active",
      trialEnd: null,
      pendingCheckoutSessionId: "cs_1",
      stripeSubscriptionId: "sub_live",
    });
    const stripe = client(stripeSub("active"), session());
    expect(await reconcilePendingCheckout(stripe, "u1")).toBe(false);
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it("forgets an expired checkout so it is not asked about again (review M1)", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      userId: "u1",
      plan: "none",
      status: "none",
      trialEnd: null,
      pendingCheckoutSessionId: "cs_1",
      stripeSubscriptionId: null,
    });
    const applied = await reconcilePendingCheckout(
      client(stripeSub("active"), session({ status: "expired", payment_status: "unpaid", subscription: null })),
      "u1"
    );
    expect(applied).toBe(false);
    expect(h.db.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", pendingCheckoutSessionId: "cs_1" },
      data: { pendingCheckoutSessionId: null },
    });
  });

  it("does nothing while the checkout is still open", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      userId: "u1",
      pendingCheckoutSessionId: "cs_1",
      stripeSubscriptionId: null,
    });
    const applied = await reconcilePendingCheckout(
      client(stripeSub("active"), session({ status: "open", payment_status: "unpaid", subscription: null })),
      "u1"
    );
    expect(applied).toBe(false);
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });
});
