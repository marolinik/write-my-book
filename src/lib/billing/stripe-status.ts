import type Stripe from "stripe";

/**
 * Map a Stripe subscription status to the canonical statuses we store:
 * active, trialing, past_due, canceled.
 */
export function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    default:
      // canceled, incomplete, incomplete_expired, unpaid, paused
      return "canceled";
  }
}

export interface SubscriptionFields {
  status: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}

const fromSeconds = (seconds: number | null | undefined): Date | undefined =>
  seconds ? new Date(seconds * 1000) : undefined;

/** The row fields Stripe is the source of truth for. Periods live on the item. */
export function subscriptionFields(sub: Stripe.Subscription): SubscriptionFields {
  const item = sub.items?.data?.[0];
  const trialEnd = fromSeconds(sub.trial_end);
  const currentPeriodStart = fromSeconds(item?.current_period_start);
  const currentPeriodEnd = fromSeconds(item?.current_period_end);
  return {
    status: mapStripeStatus(sub.status),
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    ...(trialEnd ? { trialEnd } : {}),
    ...(currentPeriodStart ? { currentPeriodStart } : {}),
    ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
  };
}
