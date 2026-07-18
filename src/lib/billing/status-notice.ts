/**
 * Pure client-safe helper for the billing page's subscription status notices
 * (D-07). Decides which honest banner to show for degraded-but-live
 * subscription states the API already reports:
 *
 * - `past_due`  — the last charge failed; Stripe is retrying. The writer must
 *   be told to update their card before access lapses.
 * - `cancelAtPeriodEnd` — the plan is scheduled to end; access continues until
 *   `currentPeriodEnd` and can be resumed via the billing portal.
 *
 * Kept free of server-only imports so the client page can import it directly
 * (do NOT route this through the `@/lib/billing` barrel, which pulls the
 * Stripe server client).
 */

export interface BillingStatusNoticeInput {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}

export interface BillingStatusNotice {
  kind: "past_due" | "cancel_at_period_end";
  title: string;
  body: string;
}

export function billingStatusNotice(
  sub: BillingStatusNoticeInput | null | undefined,
  locale: string
): BillingStatusNotice | null {
  if (!sub) return null;

  // Payment failure is the more urgent story — it wins even when a
  // cancellation is also scheduled.
  if (sub.status === "past_due") {
    return {
      kind: "past_due",
      title: "Your last payment failed",
      body:
        "We couldn't charge your payment method. Update your card via Manage Subscription to keep access — Stripe will retry the charge automatically in the meantime.",
    };
  }

  const isLive = sub.status === "active" || sub.status === "trialing";
  if (isLive && sub.cancelAtPeriodEnd) {
    const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
    const endsOn =
      end && !Number.isNaN(end.getTime())
        ? end.toLocaleDateString(locale)
        : null;
    return {
      kind: "cancel_at_period_end",
      title: "Your subscription is set to end",
      body: endsOn
        ? `Your plan ends on ${endsOn} — you keep full access until then. Changed your mind? Resume it via Manage Subscription.`
        : "Your plan ends at the close of the current billing period — you keep full access until then. Changed your mind? Resume it via Manage Subscription.",
    };
  }

  return null;
}
