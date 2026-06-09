import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, PLANS, type PlanKey } from "@/lib/billing";

/**
 * Map Stripe subscription status to our internal status.
 */
function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return "canceled";
    default:
      return "canceled";
  }
}

/**
 * Map a Stripe price ID to a plan key in our PLANS config.
 */
function planFromPriceId(priceId: string): string | null {
  for (const [key, plan] of Object.entries(PLANS)) {
    if (plan.stripePriceIds.monthly === priceId || plan.stripePriceIds.annual === priceId) {
      return key;
    }
  }
  return null;
}

export async function GET() {
  try {
    const user = await requireUser();

    let sub = await db.subscription.findUnique({
      where: { userId: user.id },
    });

    // Poll-fallback: if local data is stale (>5 min), poll Stripe and sync
    if (sub?.stripeSubscriptionId && stripe) {
      const staleMs = Date.now() - sub.updatedAt.getTime();
      if (staleMs > 5 * 60 * 1000) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
          const newStatus = mapStripeStatus(stripeSub.status);
          const item = stripeSub.items?.data?.[0];
          const priceId = item?.price?.id;
          const newPlan = priceId ? planFromPriceId(priceId) : null;
          const periodStart = item?.current_period_start;
          const periodEnd = item?.current_period_end;

          // Check if anything diverged
          const needsUpdate =
            newStatus !== sub.status ||
            (newPlan && newPlan !== sub.plan) ||
            stripeSub.cancel_at_period_end !== sub.cancelAtPeriodEnd;

          if (needsUpdate) {
            sub = await db.subscription.update({
              where: { id: sub.id },
              data: {
                status: newStatus,
                ...(newPlan ? { plan: newPlan } : {}),
                cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                ...(stripeSub.trial_end
                  ? { trialEnd: new Date(stripeSub.trial_end * 1000) }
                  : {}),
                ...(periodStart
                  ? { currentPeriodStart: new Date(periodStart * 1000) }
                  : {}),
                ...(periodEnd
                  ? { currentPeriodEnd: new Date(periodEnd * 1000) }
                  : {}),
              },
            });
          }
        } catch {
          // Ignore Stripe errors, return stale data
        }
      }
    }

    const plan = (sub?.plan ?? "none") as PlanKey;
    const planDef = plan in PLANS ? PLANS[plan as keyof typeof PLANS] : null;

    return NextResponse.json({
      plan,
      planName: planDef?.name ?? "No Plan",
      monthlyPrice: planDef?.monthlyPrice ?? 0,
      annualPrice: planDef?.annualPrice ?? null,
      features: planDef?.features ?? [],
      maxBooks: planDef?.maxBooks ?? 0,
      status: sub?.status ?? "none",
      billingInterval: sub?.billingInterval ?? "monthly",
      trialEnd: sub?.trialEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      currentPeriodEnd: sub?.currentPeriodEnd,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
