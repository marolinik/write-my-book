import type Stripe from "stripe";

/**
 * Stopping Stripe billing, idempotently.
 *
 * Used where the product must be sure Stripe will not charge again: account
 * deletion (the row that links the writer to Stripe is about to cascade away),
 * a Founder purchase that completed after every slot was taken, and a paid
 * invoice for a subscription whose writer no longer exists.
 *
 * The Stripe client is passed in rather than imported, so this module stays
 * free of server-only imports and each caller keeps its own client (and mock).
 */

/** Stripe statuses that can never produce another charge. */
const ENDED_STATUSES: ReadonlySet<string> = new Set(["canceled", "incomplete_expired"]);

function isResourceMissing(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "resource_missing";
}

export type CancelOutcome = "canceled" | "already_ended";

/**
 * Cancel one subscription immediately. A subscription that has already ended,
 * or that Stripe no longer has, counts as done. Any other failure is thrown:
 * the caller must not act as if billing had stopped.
 */
export async function cancelStripeSubscription(
  stripe: Stripe,
  subscriptionId: string
): Promise<CancelOutcome> {
  try {
    await stripe.subscriptions.cancel(subscriptionId);
    return "canceled";
  } catch (err) {
    if (isResourceMissing(err)) return "already_ended";
    // Stripe refuses to cancel a subscription that is already canceled. Ask
    // Stripe what state it is in instead of guessing from the error text.
    let current: Stripe.Subscription;
    try {
      current = await stripe.subscriptions.retrieve(subscriptionId);
    } catch (retrieveErr) {
      if (isResourceMissing(retrieveErr)) return "already_ended";
      throw err;
    }
    if (ENDED_STATUSES.has(current.status)) return "already_ended";
    throw err;
  }
}

/**
 * Cancel every subscription that can still charge this customer: each one on
 * the Stripe customer that has not ended, plus the one our row points at (in
 * case the customer id was never stored). Returns the ids it canceled.
 */
export async function cancelAllStripeSubscriptions(
  stripe: Stripe,
  refs: { customerId?: string | null; subscriptionId?: string | null }
): Promise<string[]> {
  const ids = new Set<string>();
  if (refs.subscriptionId) ids.add(refs.subscriptionId);

  if (refs.customerId) {
    try {
      const page = await stripe.subscriptions.list({
        customer: refs.customerId,
        status: "all",
        limit: 100,
      });
      for (const sub of page.data) {
        if (!ENDED_STATUSES.has(sub.status)) ids.add(sub.id);
      }
    } catch (err) {
      // A customer Stripe no longer has cannot be charged. Anything else
      // (network, auth, rate limit) means we do not know, so it is thrown.
      if (!isResourceMissing(err)) throw err;
    }
  }

  const canceled: string[] = [];
  for (const id of ids) {
    if ((await cancelStripeSubscription(stripe, id)) === "canceled") canceled.push(id);
  }
  return canceled;
}
