import { describe, it, expect, vi, beforeEach } from "vitest";

// Handler-level coverage for the Stripe billing webhook. Verifies that a
// valid-signature event drives the correct DB mutation per event type, and
// that an INVALID signature is rejected with zero DB mutation.
const h = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  db: {
    stripeWebhookEvent: { create: vi.fn(), deleteMany: vi.fn() },
    founderSlot: { create: vi.fn() },
    subscription: {
      upsert: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing", () => ({
  stripe: {
    webhooks: { constructEvent: h.constructEvent },
    subscriptions: { retrieve: h.retrieve },
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
  h.retrieve.mockResolvedValue({ trial_end: null });
});

describe("POST /api/billing/webhook", () => {
  it("checkout.session.completed upserts the subscription with the checkout plan", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
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
});
