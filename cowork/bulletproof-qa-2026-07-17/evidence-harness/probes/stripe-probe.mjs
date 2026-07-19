// probes/stripe-probe.mjs — test-mode Stripe reads + synthetic signed webhooks.
//
// (W-F3 §5.1, T13.) Two threads:
//   A — synthetic signed webhooks: build Stripe-shaped events, sign locally with
//       stripe.webhooks.generateTestHeaderString, POST to /api/billing/webhook.
//   B — real test-mode proration: throwaway customer + subscription via the SDK
//       (NEVER a persona row), upgrade mid-cycle, capture Stripe's OWN proration math
//       via the upcoming-invoice preview as a raw artifact.
//
// The D-45 fabrication was narrating "21/21 PASS" over raw ok:false + empty
// prorationLines. The hard checks this probe feeds the suite are exactly the ones
// that run skipped: prorationLines.length > 0, every ok === true, line amounts sum
// to the invoice total.
//
// Uses the existing `stripe` dependency (no new dep).

import Stripe from "stripe";

/**
 * @param {{ secretKey?: string, webhookSecret?: string }} [cfg]
 */
export function createStripeProbe(cfg = {}) {
  const key = cfg.secretKey ?? process.env.STRIPE_SECRET_KEY;
  const webhookSecret = cfg.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!key) throw new Error("[stripe-probe] STRIPE_SECRET_KEY not set (test-mode key expected)");
  if (!/^sk_test_/.test(key)) throw new Error("[stripe-probe] refusing a non-test-mode key — this probe only runs against sk_test_*");
  const stripe = new Stripe(key);

  /** Build a Stripe-shaped event and its valid test signature header. */
  function signEvent(eventObject) {
    if (!webhookSecret) throw new Error("[stripe-probe] STRIPE_WEBHOOK_SECRET not set — cannot sign synthetic webhook");
    const payload = JSON.stringify(eventObject);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    return { payload, header };
  }

  /**
   * Thread B: create a throwaway customer + subscription, upgrade mid-cycle, and
   * capture the upcoming-invoice proration preview verbatim.
   * @param {{ priceFrom: string, priceTo: string, store?: any, bracket?: string|null }} p
   */
  async function realProrationPreview(p) {
    const customer = await stripe.customers.create({ description: "wmb-harness throwaway — DELETE OK", metadata: { harness: "true" } });
    const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id }).catch(() => null);
    if (pm) await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: p.priceFrom }], payment_behavior: "default_incomplete", expand: ["latest_invoice"] });

    // Preview the proration for an upgrade to priceTo mid-cycle.
    const items = [{ id: sub.items.data[0].id, price: p.priceTo }];
    const preview = await stripe.invoices.retrieveUpcoming({ customer: customer.id, subscription: sub.id, subscription_items: items, subscription_proration_behavior: "create_prorations" });

    const artifact = { customerId: customer.id, subscriptionId: sub.id, priceFrom: p.priceFrom, priceTo: p.priceTo, upcomingInvoice: preview };
    if (p.store) artifact._stored = p.store.writeJson(artifact, { label: "stripe-proration-preview", kind: "stripe-proration", bracket: p.bracket ?? null, meta: { customerId: customer.id } });
    return { customerId: customer.id, subscriptionId: sub.id, preview, artifact };
  }

  /** Delete throwaway objects created by realProrationPreview. */
  async function cleanup(customerId) {
    try {
      await stripe.customers.del(customerId);
      return true;
    } catch {
      return false;
    }
  }

  return { stripe, signEvent, realProrationPreview, cleanup };
}
