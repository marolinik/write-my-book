import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// D-06: an actively-subscribed user must NOT be able to open a fresh Checkout
// session — completing it would create a second, parallel Stripe subscription
// (double billing). Plan changes go through the billing portal, which prorates
// the existing subscription.
const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  sessionsCreate: vi.fn(),
  sessionsRetrieve: vi.fn(),
  sessionsExpire: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  customersCreate: vi.fn(),
  $executeRaw: vi.fn(),
  db: {
    $executeRaw: vi.fn(),
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
    checkout: {
      sessions: {
        create: h.sessionsCreate,
        retrieve: h.sessionsRetrieve,
        expire: h.sessionsExpire,
      },
    },
    subscriptions: { retrieve: h.subscriptionsRetrieve },
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
  h.db.$executeRaw.mockResolvedValue([]);
  // One transaction per request; the serialisation it buys is modelled in
  // installCheckoutWorld below.
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(h.db));
  h.sessionsExpire.mockImplementation(async (id: string) => ({ id, status: "expired" }));
  h.subscriptionsRetrieve.mockResolvedValue({ status: "active" });
  h.customersCreate.mockResolvedValue({ id: "cus_new" });
  h.sessionsCreate.mockResolvedValue({
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    id: "cs_test_123",
  });
  // Default: no reusable pending session (retrieve rejects → fresh create).
  h.sessionsRetrieve.mockRejectedValue(new Error("no such checkout session"));
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

describe("POST /api/billing/checkout — pending-session dedup (no duplicate subscriptions)", () => {
  it("a still-open pending session for the same plan is REUSED (one session.create across two requests)", async () => {
    // First request: creates the session and records its id.
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "canceled",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: null,
    });
    h.sessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/c/pay/cs_new",
      id: "cs_pending",
    });

    const first = await POST(req());
    expect(first.status).toBe(200);
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    // The id is persisted for dedup.
    expect(h.db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pendingCheckoutSessionId: "cs_pending" }),
      })
    );

    // Second concurrent request: same user, same plan, pending session still OPEN.
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "canceled",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: null,
      pendingCheckoutSessionId: "cs_pending",
    });
    h.sessionsRetrieve.mockResolvedValue({
      id: "cs_pending",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_pending",
      metadata: { plan: "indie", billingInterval: "monthly" },
    });

    const second = await POST(req());
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.url).toBe("https://checkout.stripe.com/c/pay/cs_pending");
    // NO second session was created.
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("a pending session for a DIFFERENT plan does NOT block a fresh session", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "canceled",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: null,
      pendingCheckoutSessionId: "cs_pending",
    });
    h.sessionsRetrieve.mockResolvedValue({
      id: "cs_pending",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_pending",
      metadata: { plan: "indie", billingInterval: "monthly" },
    });

    // User now wants professional — must start a fresh session.
    const res = await POST(req({ plan: "professional", billingInterval: "monthly" }));
    expect(res.status).toBe(200);
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    const config = h.sessionsCreate.mock.calls[0][0];
    expect(config.metadata.plan).toBe("professional");
    // ...and the indie session is expired first, so it can no longer be paid:
    // paying both tabs would leave two live subscriptions.
    expect(h.sessionsExpire).toHaveBeenCalledWith("cs_pending");
    expect(h.sessionsExpire.mock.invocationCallOrder[0]).toBeLessThan(
      h.sessionsCreate.mock.invocationCallOrder[0]
    );
  });

  it("completing a stale pending id (retrieve fails) falls through to a fresh session and clears it", async () => {
    h.db.subscription.findUnique.mockResolvedValue({
      id: "s1",
      userId: "u1",
      status: "canceled",
      plan: "indie",
      stripeCustomerId: "cus_1",
      trialEnd: null,
      pendingCheckoutSessionId: "cs_stale",
    });
    // retrieve rejects → treat as expired/deleted → create fresh.
    h.sessionsRetrieve.mockRejectedValue(new Error("gone"));

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    // Fresh session id persisted over the stale one.
    expect(h.db.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pendingCheckoutSessionId: "cs_test_123" }),
      })
    );
  });
});

const tick = () => new Promise((r) => setTimeout(r, 0));

interface FakeSession {
  id: string;
  status: "open" | "complete" | "expired";
  url: string | null;
  subscription?: string | null;
  metadata: Record<string, string>;
}

/**
 * One writer's subscription row and their Stripe checkout sessions, in memory.
 * Statements yield between each other so concurrent requests interleave.
 * A transaction honours pg_advisory_xact_lock the way Postgres does (a second
 * locker waits until the first transaction ends); the same lock taken OUTSIDE
 * a transaction ends with its own statement and serialises nothing.
 */
function installCheckoutWorld(row: Record<string, unknown>) {
  let current: Record<string, unknown> = { ...row };
  const sessions = new Map<string, FakeSession>();
  let created = 0;
  let lockTail: Promise<void> = Promise.resolve();

  h.db.subscription.findUnique.mockImplementation(async () => {
    await tick();
    return { ...current };
  });
  h.db.subscription.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    await tick();
    current = { ...current, ...data };
    return { ...current };
  });
  h.db.$executeRaw.mockImplementation(async () => {
    await tick();
  });
  h.db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    let release = () => {};
    const tx = {
      ...h.db,
      $executeRaw: async () => {
        const previous = lockTail;
        lockTail = new Promise<void>((r) => (release = r));
        await previous;
      },
    };
    try {
      return await fn(tx);
    } finally {
      release();
    }
  });

  h.sessionsCreate.mockImplementation(async (cfg: { metadata: Record<string, string> }) => {
    await tick();
    const id = `cs_${++created}`;
    const session: FakeSession = {
      id,
      status: "open",
      url: `https://checkout.stripe.com/c/pay/${id}`,
      metadata: cfg.metadata,
    };
    sessions.set(id, session);
    return { ...session };
  });
  h.sessionsRetrieve.mockImplementation(async (id: string) => {
    await tick();
    const session = sessions.get(id);
    if (!session) throw Object.assign(new Error("No such checkout.session"), { code: "resource_missing" });
    return { ...session };
  });
  h.sessionsExpire.mockImplementation(async (id: string) => {
    await tick();
    const session = sessions.get(id);
    if (!session) throw Object.assign(new Error("No such checkout.session"), { code: "resource_missing" });
    if (session.status !== "open") {
      throw Object.assign(new Error("Only Checkout Sessions with a status of open can be expired."), {
        type: "StripeInvalidRequestError",
      });
    }
    session.status = "expired";
    return { ...session };
  });

  const open = () => [...sessions.values()].filter((s) => s.status === "open");
  return { sessions, open, row: () => current };
}

const LAPSED_ROW = {
  id: "s1",
  userId: "u1",
  status: "canceled",
  plan: "indie",
  stripeCustomerId: "cus_1",
  trialEnd: null,
  pendingCheckoutSessionId: null,
};

describe("POST /api/billing/checkout — only one payable session per writer", () => {
  it("two tabs asking for different plans at once leave exactly one session payable", async () => {
    const world = installCheckoutWorld(LAPSED_ROW);

    const [a, b] = await Promise.all([
      POST(req({ plan: "indie", billingInterval: "monthly" })),
      POST(req({ plan: "professional", billingInterval: "monthly" })),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const open = world.open();
    expect(open).toHaveLength(1);
    expect(world.row().pendingCheckoutSessionId).toBe(open[0].id);
  });

  it("two tabs asking for the same plan at once share one session", async () => {
    const world = installCheckoutWorld(LAPSED_ROW);

    const [a, b] = await Promise.all([POST(req()), POST(req())]);
    const [urlA, urlB] = [(await a.json()).url, (await b.json()).url];

    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    expect(urlA).toBe(urlB);
    expect(world.open()).toHaveLength(1);
  });

  it("changing plan in a second tab expires the first tab's session", async () => {
    const world = installCheckoutWorld(LAPSED_ROW);

    const first = await (await POST(req({ plan: "professional", billingInterval: "monthly" }))).json();
    const second = await (await POST(req({ plan: "indie", billingInterval: "monthly" }))).json();

    expect(first.url).not.toBe(second.url);
    expect(world.sessions.get("cs_1")?.status).toBe("expired");
    expect(world.open().map((s) => s.id)).toEqual(["cs_2"]);
  });

  it("a pending session the writer already paid (webhook not landed yet) → 409, no second session", async () => {
    const world = installCheckoutWorld({ ...LAPSED_ROW, pendingCheckoutSessionId: "cs_paid" });
    world.sessions.set("cs_paid", {
      id: "cs_paid",
      status: "complete",
      url: null,
      subscription: "sub_paid",
      metadata: { plan: "professional", billingInterval: "monthly" },
    });
    h.subscriptionsRetrieve.mockResolvedValue({ id: "sub_paid", status: "active" });

    const res = await POST(req({ plan: "indie", billingInterval: "monthly" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_subscribed");
    expect(h.subscriptionsRetrieve).toHaveBeenCalledWith("sub_paid");
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("a paid pending session whose subscription has since ended does not lock the writer out", async () => {
    const world = installCheckoutWorld({ ...LAPSED_ROW, pendingCheckoutSessionId: "cs_paid" });
    world.sessions.set("cs_paid", {
      id: "cs_paid",
      status: "complete",
      url: null,
      subscription: "sub_paid",
      metadata: { plan: "indie", billingInterval: "monthly" },
    });
    h.subscriptionsRetrieve.mockResolvedValue({ id: "sub_paid", status: "canceled" });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("the old session was paid just as the new plan was asked for → 409, no second session", async () => {
    const world = installCheckoutWorld({ ...LAPSED_ROW, pendingCheckoutSessionId: "cs_old" });
    world.sessions.set("cs_old", {
      id: "cs_old",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_old",
      subscription: null,
      metadata: { plan: "professional", billingInterval: "monthly" },
    });
    // The writer completes it between our read and our expire.
    const expire = h.sessionsExpire.getMockImplementation()!;
    h.sessionsExpire.mockImplementationOnce(async (id: string) => {
      Object.assign(world.sessions.get(id)!, { status: "complete", subscription: "sub_old" });
      return expire(id);
    });
    h.subscriptionsRetrieve.mockResolvedValue({ id: "sub_old", status: "active" });

    const res = await POST(req({ plan: "indie", billingInterval: "monthly" }));
    expect(res.status).toBe(409);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  it("if the old session cannot be expired, no second session is opened", async () => {
    const world = installCheckoutWorld({ ...LAPSED_ROW, pendingCheckoutSessionId: "cs_old" });
    world.sessions.set("cs_old", {
      id: "cs_old",
      status: "open",
      url: "https://checkout.stripe.com/c/pay/cs_old",
      metadata: { plan: "professional", billingInterval: "monthly" },
    });
    h.sessionsExpire.mockRejectedValueOnce(
      Object.assign(new Error("connect ECONNREFUSED"), { type: "StripeConnectionError" })
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req({ plan: "indie", billingInterval: "monthly" }));
    expect(res.status).toBe(500);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(world.open().map((s) => s.id)).toEqual(["cs_old"]);
    spy.mockRestore();
  });
});
