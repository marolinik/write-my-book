import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * X-S18 / P7-S08 — the Founder cap of 200 was checked only when checkout
 * OPENED (a read-only count that reserved nothing), and the webhook inserted
 * the slot unconditionally with `.catch(() => {})`. Two sessions opened at 199
 * that both completed produced 201 Founders and a counter showing "-1 left".
 * The cap must hold where the slot is actually taken: the webhook, under one
 * lock shared by every claimer. A purchase that completes after the last slot
 * went is refused: its subscription is canceled and the refund is flagged.
 *
 * P3-S06 (second half) — invoice.paid for a subscription with no row was
 * acknowledged silently. A paid invoice for a writer who no longer exists is
 * money taken for nothing; it is logged loudly and the orphan is canceled.
 */
const h = vi.hoisted(() => ({
  retrieve: vi.fn(),
  cancel: vi.fn(),
  list: vi.fn(),
  customersRetrieve: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  db: {
    stripeWebhookEvent: { create: vi.fn(), deleteMany: vi.fn() },
    founderSlot: { create: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    subscription: { upsert: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
vi.mock("@/lib/billing", () => ({
  stripe: {
    // The raw body IS the event here, so concurrent deliveries stay distinct.
    webhooks: { constructEvent: (body: string) => JSON.parse(body) },
    subscriptions: { retrieve: h.retrieve, cancel: h.cancel, list: h.list },
    customers: { retrieve: h.customersRetrieve },
  },
  PLANS: {
    indie: { stripePriceIds: { monthly: "price_indie_m", annual: "price_indie_a" } },
    founder: { stripePriceIds: { monthly: "price_founder_m" } },
  },
}));

import { POST } from "@/app/api/billing/webhook/route";

function deliver(event: unknown) {
  return POST(
    new Request("http://t/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig_ok" },
      body: JSON.stringify(event),
    }) as never
  );
}

function founderCheckout(userId: string, n = 1) {
  return {
    id: `evt_founder_${userId}_${n}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${userId}`,
        subscription: `sub_${userId}`,
        customer: `cus_${userId}`,
        invoice: `in_${userId}`,
        metadata: { userId, plan: "founder", billingInterval: "monthly" },
      },
    },
  };
}

function invoicePaid(subscriptionId: string, customer: string) {
  return {
    id: `evt_paid_${subscriptionId}`,
    type: "invoice.paid",
    data: {
      object: {
        id: `in_${subscriptionId}`,
        customer,
        parent: { subscription_details: { subscription: subscriptionId } },
      },
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * An in-memory founder_slots table whose transactions honour
 * pg_advisory_xact_lock the way Postgres does: a second locker waits until the
 * first transaction ends. Statements yield between each other so concurrent
 * deliveries genuinely interleave.
 */
function installSlotTable(initial: number) {
  const slots: string[] = Array.from({ length: initial }, (_, i) => `filler_${i}`);
  let lockTail: Promise<void> = Promise.resolve();

  const table = {
    count: async () => {
      await tick();
      return slots.length;
    },
    findUnique: async ({ where }: { where: { userId: string } }) => {
      await tick();
      return slots.includes(where.userId) ? { userId: where.userId } : null;
    },
    create: async ({ data }: { data: { userId: string } }) => {
      await tick();
      if (slots.includes(data.userId)) throw Object.assign(new Error("unique"), { code: "P2002" });
      slots.push(data.userId);
      return data;
    },
  };
  // The pre-fix webhook wrote straight to the table, outside any transaction.
  h.db.founderSlot.count.mockImplementation(table.count);
  h.db.founderSlot.findUnique.mockImplementation(table.findUnique);
  h.db.founderSlot.create.mockImplementation(table.create);

  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    let release = () => {};
    const tx = {
      $executeRaw: async () => {
        const previous = lockTail;
        lockTail = new Promise<void>((r) => (release = r));
        await previous;
      },
      founderSlot: table,
    };
    try {
      return await fn(tx);
    } finally {
      release();
    }
  });
  return slots;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  h.db.stripeWebhookEvent.create.mockResolvedValue({});
  h.db.stripeWebhookEvent.deleteMany.mockResolvedValue({ count: 0 });
  h.db.subscription.upsert.mockResolvedValue({});
  h.db.subscription.update.mockResolvedValue({});
  h.db.subscription.findFirst.mockResolvedValue(null);
  h.db.user.findUnique.mockResolvedValue(null);
  h.retrieve.mockResolvedValue({ trial_end: null, status: "active" });
  h.cancel.mockImplementation(async (id: string) => ({ id, status: "canceled" }));
  h.list.mockResolvedValue({ data: [] });
});

describe("Founder cap is enforced where the slot is taken (X-S18, P7-S08)", () => {
  it("two purchases completing at 199 slots produce exactly one Founder, never 201", async () => {
    const slots = installSlotTable(199);

    const [a, b] = await Promise.all([
      deliver(founderCheckout("u_a")),
      deliver(founderCheckout("u_b")),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    expect(slots.length).toBe(200);
    const winners = ["u_a", "u_b"].filter((u) => slots.includes(u));
    expect(winners).toHaveLength(1);

    // The loser's paid subscription is stopped, and their row says canceled.
    const loser = winners[0] === "u_a" ? "u_b" : "u_a";
    expect(h.cancel).toHaveBeenCalledWith(`sub_${loser}`);
    expect(h.cancel).toHaveBeenCalledTimes(1);
    const loserUpsert = h.db.subscription.upsert.mock.calls
      .map((c) => c[0])
      .find((c) => c.where.userId === loser);
    expect(loserUpsert.update.status).toBe("canceled");
    expect(loserUpsert.create.status).toBe("canceled");
    const winnerUpsert = h.db.subscription.upsert.mock.calls
      .map((c) => c[0])
      .find((c) => c.where.userId === winners[0]);
    expect(winnerUpsert.update.status).toBe("active");
  });

  it("a purchase completing when all 200 are taken is refused, canceled and flagged for refund", async () => {
    const slots = installSlotTable(200);

    const res = await deliver(founderCheckout("u_late"));
    expect(res.status).toBe(200);

    expect(slots).not.toContain("u_late");
    expect(slots.length).toBe(200);
    expect(h.cancel).toHaveBeenCalledWith("sub_u_late");
    const upsert = h.db.subscription.upsert.mock.calls[0][0];
    expect(upsert.update.status).toBe("canceled");
    expect(upsert.update.pendingCheckoutSessionId).toBeNull();

    const logged = JSON.stringify(h.logger.error.mock.calls);
    expect(logged).toMatch(/refund/i);
    expect(logged).toContain("u_late");
    expect(logged).toContain("sub_u_late");
    expect(logged).toContain("in_u_late");
  });

  it("under the cap the slot is claimed and the writer becomes an active Founder", async () => {
    const slots = installSlotTable(10);

    const res = await deliver(founderCheckout("u_new"));
    expect(res.status).toBe(200);
    expect(slots).toContain("u_new");
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.db.subscription.upsert.mock.calls[0][0].update.status).toBe("active");
  });

  it("a redelivery for a writer who already holds a slot still grants the plan, without a second slot", async () => {
    const slots = installSlotTable(200);
    slots[0] = "u_owner"; // holds one of the 200

    const res = await deliver(founderCheckout("u_owner", 2));
    expect(res.status).toBe(200);
    expect(slots.filter((s) => s === "u_owner")).toHaveLength(1);
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.db.subscription.upsert.mock.calls[0][0].update.status).toBe("active");
  });

  it("a slot-claim failure is not swallowed: 500 and the event is released for Stripe's retry", async () => {
    installSlotTable(5);
    h.db.$transaction.mockRejectedValueOnce(new Error("db down"));

    const res = await deliver(founderCheckout("u_x"));
    expect(res.status).toBe(500);
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
    expect(h.db.stripeWebhookEvent.deleteMany).toHaveBeenCalledWith({
      where: { stripeEventId: "evt_founder_u_x_1" },
    });
  });

  it("if Stripe cannot cancel the over-cap subscription, the event fails and is retried", async () => {
    installSlotTable(200);
    h.cancel.mockRejectedValue(Object.assign(new Error("offline"), { type: "StripeConnectionError" }));
    h.retrieve.mockRejectedValue(Object.assign(new Error("offline"), { type: "StripeConnectionError" }));

    const res = await deliver(founderCheckout("u_late"));
    expect(res.status).toBe(500);
    expect(h.db.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("invoice.paid for a subscription with no row (P3-S06)", () => {
  function rowsByWhere(rows: { bySub?: unknown; byCustomer?: unknown }) {
    h.db.subscription.findFirst.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.stripeSubscriptionId) return rows.bySub ?? null;
      if (where.stripeCustomerId) return rows.byCustomer ?? null;
      return null;
    });
  }

  it("the writer was deleted: logged loudly and the orphaned subscription is canceled", async () => {
    rowsByWhere({});
    h.customersRetrieve.mockResolvedValue({ id: "cus_gone", metadata: { userId: "u_deleted" } });
    h.db.user.findUnique.mockResolvedValue(null);

    const res = await deliver(invoicePaid("sub_orphan", "cus_gone"));
    expect(res.status).toBe(200);
    expect(h.cancel).toHaveBeenCalledWith("sub_orphan");
    const logged = JSON.stringify(h.logger.error.mock.calls);
    expect(logged).toContain("sub_orphan");
    expect(logged).toContain("cus_gone");
    expect(logged).toMatch(/refund/i);
  });

  it("a customer Stripe has deleted is an orphan too", async () => {
    rowsByWhere({});
    h.customersRetrieve.mockResolvedValue({ id: "cus_del", deleted: true });

    const res = await deliver(invoicePaid("sub_orphan2", "cus_del"));
    expect(res.status).toBe(200);
    expect(h.cancel).toHaveBeenCalledWith("sub_orphan2");
  });

  it("the writer still exists (invoice raced ahead of checkout completion): logged, NOT canceled", async () => {
    rowsByWhere({ byCustomer: { id: "s1", userId: "u_live", stripeCustomerId: "cus_live" } });

    const res = await deliver(invoicePaid("sub_new", "cus_live"));
    expect(res.status).toBe(200);
    expect(h.cancel).not.toHaveBeenCalled();
    expect(h.logger.warn.mock.calls.length + h.logger.error.mock.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify([h.logger.warn.mock.calls, h.logger.error.mock.calls])).toContain("sub_new");
  });

  it("an existing user found through the customer's metadata is not canceled", async () => {
    rowsByWhere({});
    h.customersRetrieve.mockResolvedValue({ id: "cus_x", metadata: { userId: "u_here" } });
    h.db.user.findUnique.mockResolvedValue({ id: "u_here" });

    const res = await deliver(invoicePaid("sub_x", "cus_x"));
    expect(res.status).toBe(200);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("a customer we never created (no userId metadata) is logged but left alone", async () => {
    rowsByWhere({});
    h.customersRetrieve.mockResolvedValue({ id: "cus_foreign", metadata: {} });

    const res = await deliver(invoicePaid("sub_foreign", "cus_foreign"));
    expect(res.status).toBe(200);
    expect(h.cancel).not.toHaveBeenCalled();
    expect(JSON.stringify(h.logger.error.mock.calls)).toContain("sub_foreign");
  });

  it("if the orphan cannot be canceled, the event fails so Stripe retries it", async () => {
    rowsByWhere({});
    h.customersRetrieve.mockResolvedValue({ id: "cus_gone", metadata: { userId: "u_deleted" } });
    h.cancel.mockRejectedValue(Object.assign(new Error("offline"), { type: "StripeConnectionError" }));
    h.retrieve.mockRejectedValue(Object.assign(new Error("offline"), { type: "StripeConnectionError" }));

    const res = await deliver(invoicePaid("sub_orphan", "cus_gone"));
    expect(res.status).toBe(500);
  });
});
