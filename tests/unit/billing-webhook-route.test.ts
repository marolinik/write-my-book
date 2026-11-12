import { describe, it, expect, vi, beforeEach } from "vitest";

// Handler-level coverage for the Stripe billing webhook. Verifies that a
// valid-signature event drives the correct DB mutation per event type, and
// that an INVALID signature is rejected with zero DB mutation.
const h = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  cancel: vi.fn(),
  db: {
    stripeWebhookEvent: { create: vi.fn(), deleteMany: vi.fn() },
    founderSlot: { create: vi.fn() },
    subscription: {
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
  loggerError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: h.loggerError, warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing", () => ({
  stripe: {
    webhooks: { constructEvent: h.constructEvent },
    subscriptions: { retrieve: h.retrieve, cancel: h.cancel },
  },
  PLANS: {
    indie: {
      stripePriceIds: { monthly: "price_indie_m", annual: "price_indie_a" },
    },
    founder: {
      stripePriceIds: { monthly: "price_founder_m" },
    },
  },
}));

import { POST } from "@/app/api/billing/webhook/route";

function req(signature: string | null = "sig_ok") {
  const headers: Record<string, string> = {};
  if (signature !== null) headers["stripe-signature"] = signature;
  return new Request("http://t/api/billing/webhook", {
    method: "POST",
    headers,
    body: "raw-stripe-payload",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  // New event by default (dedup insert succeeds).
  h.db.stripeWebhookEvent.create.mockResolvedValue({});
  h.db.stripeWebhookEvent.deleteMany.mockResolvedValue({ count: 0 });
  h.db.founderSlot.create.mockResolvedValue({});
  h.db.subscription.upsert.mockResolvedValue({});
  h.db.subscription.update.mockResolvedValue({});
  h.db.subscription.findFirst.mockResolvedValue(null);
  // The checkout's writer still has an account.
  h.db.user.findUnique.mockResolvedValue({ id: "u1" });
  h.retrieve.mockResolvedValue({ trial_end: null, status: "active" });
});

describe("POST /api/billing/webhook — review C1: subscription events never grant on their own", () => {
  const subEvent = (type: string) => ({
    id: `evt_${type}`,
    type,
    data: {
      object: {
        id: "sub_unknown",
        status: "active",
        customer: "cus_x",
        cancel_at_period_end: false,
        metadata: { userId: "u1", plan: "founder" },
        items: { data: [{ price: { id: "price_founder_m", recurring: { interval: "month" } } }] },
      },
    },
  });

  it("customer.subscription.created for a subscription no row holds changes nothing", async () => {
    h.db.subscription.findFirst.mockResolvedValue(null);
    h.constructEvent.mockReturnValue(subEvent("customer.subscription.created"));
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
    expect(h.db.subscription.update).not.toHaveBeenCalled();
  });

  it("customer.subscription.updated for a subscription no row holds changes nothing, whatever its metadata says", async () => {
    h.db.subscription.findFirst.mockResolvedValue(null);
    h.constructEvent.mockReturnValue(subEvent("customer.subscription.updated"));
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
    expect(h.db.subscription.update).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/webhook — review I3: a failed async payment", () => {
  it("checkout.session.async_payment_failed cancels the subscription and clears the pending checkout", async () => {
    h.cancel.mockResolvedValue({ id: "sub_123", status: "canceled" });
    h.db.subscription.updateMany.mockResolvedValue({ count: 1 });
    h.constructEvent.mockReturnValue({
      id: "evt_async_failed",
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: "cs_sepa",
          payment_status: "unpaid",
          subscription: "sub_123",
          customer: "cus_123",
          metadata: { userId: "u1", plan: "indie", billingInterval: "monthly" },
        },
      },
    });
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.cancel).toHaveBeenCalledWith("sub_123");
    expect(h.db.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", pendingCheckoutSessionId: "cs_sepa" },
      data: { pendingCheckoutSessionId: null },
    });
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/webhook — payment state (P2-7)", () => {
  const paidLater = (type: string, payment_status: string) => ({
    id: `evt_${type}`,
    type,
    data: {
      object: {
        payment_status,
        subscription: "sub_123",
        customer: "cus_123",
        metadata: { userId: "u1", plan: "indie", billingInterval: "monthly" },
      },
    },
  });

  it("checkout.session.async_payment_succeeded grants the plan", async () => {
    h.constructEvent.mockReturnValue(paidLater("checkout.session.async_payment_succeeded", "paid"));
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(h.db.subscription.upsert.mock.calls[0][0].create.plan).toBe("indie");
  });

  it("checkout.session.completed with the payment still pending grants nothing", async () => {
    h.constructEvent.mockReturnValue(paidLater("checkout.session.completed", "unpaid"));
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("an invalid signature is reported to error monitoring, not just answered 400", async () => {
    h.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });
    const res = await POST(req("sig_bad") as never);
    expect(res.status).toBe(400);
    expect(h.loggerError).toHaveBeenCalledWith(
      expect.stringContaining("signature"),
      expect.anything(),
      expect.anything()
    );
  });
});

describe("POST /api/billing/webhook", () => {
  it("checkout.session.completed upserts the subscription with the checkout plan", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: "paid",
          subscription: "sub_123",
          customer: "cus_123",
          metadata: { userId: "u1", plan: "indie", billingInterval: "monthly" },
        },
      },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });

    expect(h.db.subscription.upsert).toHaveBeenCalledTimes(1);
    const call = h.db.subscription.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: "u1" });
    expect(call.update.plan).toBe("indie");
    expect(call.update.stripeSubscriptionId).toBe("sub_123");
    expect(call.create.userId).toBe("u1");
    expect(call.create.status).toBe("active");
  });

  it("customer.subscription.updated upserts mapped status + plan from price id", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({ userId: "u1" });
    h.constructEvent.mockReturnValue({
      id: "evt_2",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "past_due",
          cancel_at_period_end: false,
          items: { data: [{ price: { id: "price_indie_a", recurring: { interval: "year" } } }] },
        },
      },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);

    expect(h.db.subscription.upsert).toHaveBeenCalledTimes(1);
    const call = h.db.subscription.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: "u1" });
    expect(call.update.status).toBe("past_due");
    expect(call.update.plan).toBe("indie");
    expect(call.update.billingInterval).toBe("annual");
  });

  it("customer.subscription.deleted marks the existing record canceled", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({ id: "s1", userId: "u1" });
    h.constructEvent.mockReturnValue({
      id: "evt_3",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_123" } },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);

    expect(h.db.subscription.update).toHaveBeenCalledTimes(1);
    const call = h.db.subscription.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "s1" });
    expect(call.data).toEqual({ status: "canceled" });
  });

  it("rejects an INVALID signature with 400 and performs no DB mutation", async () => {
    h.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const res = await POST(req("bad_sig") as never);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid signature" });

    // No event recorded, no subscription touched.
    expect(h.db.stripeWebhookEvent.create).not.toHaveBeenCalled();
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
    expect(h.db.subscription.update).not.toHaveBeenCalled();
  });

  it("deduplicates a redelivered event (P2002 claim) without side effects", async () => {
    h.db.stripeWebhookEvent.create.mockRejectedValueOnce({ code: "P2002" });
    h.constructEvent.mockReturnValue({
      id: "evt_dup",
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_123", customer: "cus_123", metadata: { userId: "u1", plan: "indie" } } },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true, deduplicated: true });
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("H4: releases the claim and returns 500 when handling throws, so Stripe retries", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_boom",
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: "paid",
          subscription: "sub_boom",
          customer: "cus_123",
          metadata: { userId: "u1", plan: "indie", billingInterval: "monthly" },
        },
      },
    });
    h.db.subscription.upsert.mockRejectedValueOnce(new Error("transient db failure"));

    const res = await POST(req() as never);
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "Webhook processing failed" });

    // The consumed-claim row must be deleted, otherwise Stripe's retry of
    // this event would be deduped against the dead delivery and the
    // entitlement change lost forever.
    expect(h.db.stripeWebhookEvent.deleteMany).toHaveBeenCalledWith({
      where: { stripeEventId: "evt_boom" },
    });
  });

  it("invoice.paid rewrites a canceled sub to active ONLY when Stripe still reports it live", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      status: "canceled",
      stripeSubscriptionId: "sub_123",
    });
    // Stripe now says the sub is canceled → invoice.paid must NOT resurrect it.
    h.retrieve.mockResolvedValueOnce({ status: "canceled", cancel_at_period_end: true });
    h.constructEvent.mockReturnValue({
      id: "evt_paid_canceled",
      type: "invoice.paid",
      data: {
        object: { parent: { subscription_details: { subscription: "sub_123" } } },
      },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const call = h.db.subscription.update.mock.calls[0][0];
    // Reconciles to the AUTHORITATIVE canceled state, never active.
    expect(call).toEqual(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "canceled", cancelAtPeriodEnd: true }),
      })
    );
    expect(call.data.status).not.toBe("active");
  });

  it("invoice.paid sets active when Stripe still reports an active sub", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      status: "past_due",
      stripeSubscriptionId: "sub_123",
    });
    h.retrieve.mockResolvedValueOnce({ status: "active", cancel_at_period_end: false });
    h.constructEvent.mockReturnValue({
      id: "evt_paid_active",
      type: "invoice.paid",
      data: {
        object: { parent: { subscription_details: { subscription: "sub_123" } } },
      },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const call = h.db.subscription.update.mock.calls[0][0];
    expect(call.data.status).toBe("active");
  });

  it("customer.subscription.updated does NOT resurrect a canceled sub when Stripe disagrees", async () => {
    // Existing row is canceled; the event CLAIMS active (stale/sibling).
    h.db.subscription.findFirst.mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      status: "canceled",
      stripeSubscriptionId: "sub_123",
    });
    // Stripe's live state is canceled → the stale 'active' claim is overridden.
    h.retrieve.mockResolvedValueOnce({ status: "canceled", cancel_at_period_end: true });
    h.constructEvent.mockReturnValue({
      id: "evt_upd_stale",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: "price_indie_m", recurring: { interval: "month" } } }],
          },
        },
      },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const call = h.db.subscription.upsert.mock.calls[0][0];
    expect(call.update.status).toBe("canceled"); // rejected the stale resurrection
  });

  it("customer.subscription.updated resurrects a canceled sub when Stripe confirms active", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({
      id: "s1",
      userId: "u1",
      status: "canceled",
      stripeSubscriptionId: "sub_123",
    });
    // Stripe confirms the sub is genuinely active again.
    h.retrieve.mockResolvedValueOnce({ status: "active", cancel_at_period_end: false });
    h.constructEvent.mockReturnValue({
      id: "evt_upd_reactive",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: "price_indie_m", recurring: { interval: "month" } } }],
          },
        },
      },
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const call = h.db.subscription.upsert.mock.calls[0][0];
    expect(call.update.status).toBe("active");
  });
});

// P2-65 (Wave 5 Task 8): the handled events no test exercised.
describe("POST /api/billing/webhook — payment failures and trial reminders", () => {
  const failedInvoice = (subscription: unknown) => ({
    id: "evt_pf",
    type: "invoice.payment_failed",
    data: { object: { id: "in_1", parent: { subscription_details: { subscription } } } },
  });

  it("invoice.payment_failed marks only the matching live row past_due", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({ id: "s1", userId: "u1", status: "active" });
    h.constructEvent.mockReturnValue(failedInvoice("sub_123"));
    expect((await POST(req() as never)).status).toBe(200);
    expect(h.db.subscription.findFirst).toHaveBeenCalledWith({ where: { stripeSubscriptionId: "sub_123" } });
    expect(h.db.subscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "past_due" } });
  });

  it("invoice.payment_failed reads the subscription id from an expanded object too", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({ id: "s1", userId: "u1", status: "trialing" });
    h.constructEvent.mockReturnValue(failedInvoice({ id: "sub_123" }));
    await POST(req() as never);
    expect(h.db.subscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { status: "past_due" } });
  });

  it("invoice.payment_failed never turns a canceled row into past_due (which gating treats as paid)", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce({ id: "s1", userId: "u1", status: "canceled" });
    h.constructEvent.mockReturnValue(failedInvoice("sub_123"));
    expect((await POST(req() as never)).status).toBe(200);
    expect(h.db.subscription.update).not.toHaveBeenCalled();
  });

  it("invoice.payment_failed with no matching row, or no subscription, writes nothing", async () => {
    h.db.subscription.findFirst.mockResolvedValueOnce(null);
    h.constructEvent.mockReturnValue(failedInvoice("sub_unknown"));
    expect((await POST(req() as never)).status).toBe(200);
    h.constructEvent.mockReturnValue({ id: "evt_pf2", type: "invoice.payment_failed", data: { object: { id: "in_2", parent: null } } });
    expect((await POST(req() as never)).status).toBe(200);
    expect(h.db.subscription.update).not.toHaveBeenCalled();
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("customer.subscription.trial_will_end changes nothing", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_twe",
      type: "customer.subscription.trial_will_end",
      data: { object: { id: "sub_123", trial_end: 1_800_000_000 } },
    });
    expect((await POST(req() as never)).status).toBe(200);
    expect(h.db.subscription.update).not.toHaveBeenCalled();
    expect(h.db.subscription.updateMany).not.toHaveBeenCalled();
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });
});
