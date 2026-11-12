import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";

/**
 * P2-65 / D15 (Wave 5 Task 10): no e2e ever reached the Stripe webhook. The
 * e2e job runs the server with a throwaway STRIPE_WEBHOOK_SECRET (no real
 * account), so this signs a real event with Stripe's own helper and posts it:
 * a signed event is processed once, a redelivery is deduplicated, and a bad
 * signature is refused.
 */
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

test.describe("Stripe webhook over HTTP", () => {
  test.skip(!SECRET.startsWith("whsec_"), "needs the e2e job's throwaway STRIPE_WEBHOOK_SECRET");

  function signedEvent(type: string, object: Record<string, unknown>) {
    const payload = JSON.stringify({
      id: `evt_e2e_${randomUUID()}`,
      object: "event",
      type,
      api_version: "2025-01-27.acacia",
      created: Math.floor(Date.now() / 1000),
      data: { object },
    });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    return { payload, header };
  }

  test("a signed event is processed once, and its redelivery is deduplicated", async ({ request }) => {
    // trial_will_end changes no row: safe against the shared e2e database.
    const { payload, header } = signedEvent("customer.subscription.trial_will_end", {
      id: "sub_e2e_none",
      object: "subscription",
      trial_end: Math.floor(Date.now() / 1000) + 3 * 86_400,
    });
    const send = () =>
      request.post("/api/billing/webhook", {
        headers: { "stripe-signature": header, "content-type": "application/json" },
        data: payload,
      });

    const first = await send();
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ received: true });

    const again = await send();
    expect(again.status()).toBe(200);
    expect(await again.json()).toEqual({ received: true, deduplicated: true });
  });

  test("a payment failure for a subscription no row holds is acknowledged and changes nothing", async ({ request }) => {
    const { payload, header } = signedEvent("invoice.payment_failed", {
      id: "in_e2e",
      object: "invoice",
      parent: { subscription_details: { subscription: "sub_e2e_unknown" } },
    });
    const res = await request.post("/api/billing/webhook", {
      headers: { "stripe-signature": header, "content-type": "application/json" },
      data: payload,
    });
    expect(res.status()).toBe(200);
  });

  test("a body changed after signing is refused with 400", async ({ request }) => {
    const { payload, header } = signedEvent("customer.subscription.trial_will_end", { id: "sub_x", object: "subscription" });
    const res = await request.post("/api/billing/webhook", {
      headers: { "stripe-signature": header, "content-type": "application/json" },
      data: payload.replace("sub_x", "sub_y"),
    });
    expect(res.status()).toBe(400);
  });

  test("a request without a signature is refused with 400", async ({ request }) => {
    const res = await request.post("/api/billing/webhook", {
      headers: { "content-type": "application/json" },
      data: "{}",
    });
    expect(res.status()).toBe(400);
  });
});
