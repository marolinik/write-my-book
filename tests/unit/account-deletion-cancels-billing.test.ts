import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P3-S06 — deleting the account (Clerk user.deleted) only ran
 * db.user.deleteMany. The local subscription row cascaded away, but the Stripe
 * subscription stayed live and kept renewing: the writer was billed for a
 * service that no longer existed, and nothing in the product could see it.
 *
 * Deletion must stop every charge Stripe can still make BEFORE the row that
 * links the writer to Stripe disappears. It must be idempotent (Clerk
 * redelivers) and a Stripe failure must fail the webhook so Clerk retries —
 * never delete the account while billing is still running.
 */
const h = vi.hoisted(() => ({
  payload: null as unknown,
  db: {
    user: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    subscription: { findFirst: vi.fn() },
  },
  stripe: {
    subscriptions: { list: vi.fn(), cancel: vi.fn(), retrieve: vi.fn() },
  } as null | {
    subscriptions: {
      list: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
      retrieve: ReturnType<typeof vi.fn>;
    };
  },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  calls: [] as string[],
}));

vi.mock("svix", () => ({
  Webhook: class {
    verify() {
      return h.payload;
    }
  },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
vi.mock("@/lib/llm/defaults", () => ({ getDefaultModelId: () => "model-x" }));
vi.mock("@/lib/billing", () => ({
  get stripe() {
    return h.stripe;
  },
}));

import { POST } from "@/app/api/auth/webhook/route";

const stripeMock = {
  subscriptions: { list: vi.fn(), cancel: vi.fn(), retrieve: vi.fn() },
};

function req() {
  return new Request("http://t/api/auth/webhook", {
    method: "POST",
    headers: {
      "svix-id": "msg_1",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,sig",
    },
    body: "raw",
  });
}

function stripeError(code: string, message = code) {
  return Object.assign(new Error(message), { code, type: "StripeInvalidRequestError" });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.calls = [];
  process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
  h.payload = { type: "user.deleted", data: { id: "user_clerk_1" } };
  h.stripe = stripeMock;
  h.db.subscription.findFirst.mockResolvedValue({
    userId: "u1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  });
  h.db.user.deleteMany.mockImplementation(async () => {
    h.calls.push("deleteUser");
    return { count: 1 };
  });
  stripeMock.subscriptions.list.mockResolvedValue({
    data: [
      { id: "sub_1", status: "active" },
      { id: "sub_old", status: "canceled" },
    ],
  });
  stripeMock.subscriptions.cancel.mockImplementation(async (id: string) => {
    h.calls.push(`cancel:${id}`);
    return { id, status: "canceled" };
  });
  stripeMock.subscriptions.retrieve.mockResolvedValue({ status: "canceled" });
});

describe("Clerk user.deleted — billing stops before the account goes (P3-S06)", () => {
  it("cancels the live Stripe subscription immediately, then deletes the user", async () => {
    const res = await POST(req() as never);
    expect(res.status).toBe(200);

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
    // Already-ended subscriptions on the customer are left alone.
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalledWith("sub_old");
    // Order matters: the row that links the writer to Stripe must outlive the
    // cancellation, or a failure would leave a charge nobody can trace.
    expect(h.calls).toEqual(["cancel:sub_1", "deleteUser"]);
    expect(h.db.user.deleteMany).toHaveBeenCalledWith({ where: { clerkId: "user_clerk_1" } });
  });

  it("also cancels a live subscription on the customer that the row does not point at", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [
        { id: "sub_1", status: "active" },
        { id: "sub_parallel", status: "trialing" },
      ],
    });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith("sub_parallel");
    expect(h.db.user.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a subscription Stripe already ended counts as done", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.subscriptions.cancel.mockRejectedValue(
      stripeError("subscription_canceled", "This subscription is already canceled.")
    );
    stripeMock.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "canceled" });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.user.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("treats a subscription or customer Stripe no longer has as nothing to cancel", async () => {
    stripeMock.subscriptions.list.mockRejectedValue(stripeError("resource_missing"));
    stripeMock.subscriptions.cancel.mockRejectedValue(stripeError("resource_missing"));

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.user.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("a writer with no billing record is deleted without touching Stripe", async () => {
    h.db.subscription.findFirst.mockResolvedValue(null);

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(h.db.user.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("a redelivery after the user is gone is a clean no-op", async () => {
    h.db.subscription.findFirst.mockResolvedValue(null);
    h.db.user.deleteMany.mockResolvedValue({ count: 0 });

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it("when Stripe cannot cancel, the webhook fails (Clerk retries) and the account is NOT deleted", async () => {
    stripeMock.subscriptions.cancel.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), { type: "StripeConnectionError" })
    );
    stripeMock.subscriptions.retrieve.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), { type: "StripeConnectionError" })
    );

    const res = await POST(req() as never);
    expect(res.status).toBe(500);
    expect(h.db.user.deleteMany).not.toHaveBeenCalled();
    // Logged with the ids a human needs, not swallowed.
    const logged = JSON.stringify(h.logger.error.mock.calls);
    expect(logged).toContain("sub_1");
    expect(logged).toContain("user_clerk_1");
  });

  it("a still-live subscription Stripe refuses to cancel is a failure, not 'already ended'", async () => {
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.subscriptions.cancel.mockRejectedValue(stripeError("rate_limit"));
    stripeMock.subscriptions.retrieve.mockResolvedValue({ id: "sub_1", status: "active" });

    const res = await POST(req() as never);
    expect(res.status).toBe(500);
    expect(h.db.user.deleteMany).not.toHaveBeenCalled();
  });

  it("without Stripe configured, deletion proceeds and the stranded subscription is logged loudly", async () => {
    h.stripe = null;

    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.user.deleteMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.logger.error.mock.calls)).toContain("sub_1");
  });
});
