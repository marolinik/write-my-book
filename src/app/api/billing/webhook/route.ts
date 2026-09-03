import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripe, PLANS } from "@/lib/billing";
import type Stripe from "stripe";

/**
 * Claim an event for processing (H4 hardening). A successful insert means
 * THIS delivery owns processing; the unique violation means a delivery that
 * already finished consumed it. If processing throws, the caller RELEASES
 * the claim (deletes the row) so Stripe's automatic retry can re-process.
 * Pre-fix the row marked the event consumed BEFORE the handler ran, so any
 * mid-handler failure (DB blip, provider timeout) + retry = permanently lost
 * entitlement event (paid customer stuck on Free, or cancellation ignored).
 */
async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  try {
    await db.stripeWebhookEvent.create({
      data: { stripeEventId: eventId, eventType },
    });
    return false; // Claimed fresh by this delivery
  } catch (e: unknown) {
    const prismaError = e as { code?: string };
    if (prismaError?.code === "P2002") return true; // Already consumed (unique constraint violation)
    throw e;
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

/**
 * Map Stripe subscription status to our internal status.
 * We only store canonical statuses: active, trialing, past_due, canceled.
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
 * Extract billing interval from a Stripe subscription's price.
 */
function extractBillingInterval(subscription: Stripe.Subscription): string {
  const item = subscription.items?.data?.[0];
  const interval = item?.price?.recurring?.interval;
  return interval === "year" ? "annual" : "monthly";
}

/** POST /api/billing/webhook -- Stripe webhook handler with idempotency and 7 event types. */
export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: claim the event; skip only if a completed delivery took it
  if (await claimEvent(event.id, event.type)) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    switch (event.type) {
    // ─── 1. Checkout completed ───────────────────────────────────
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan;
      const billingInterval = session.metadata?.billingInterval ?? "monthly";

      if (userId && plan && session.subscription) {
        // Claim founder slot if applicable (ignore if already claimed)
        if (plan === "founder") {
          await db.founderSlot.create({ data: { userId } }).catch(() => {});
        }

        // Retrieve the full subscription to check trial status
        let trialEnd: Date | null = null;
        let status = "active";
        try {
          const stripeSub = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          if (stripeSub.trial_end) {
            trialEnd = new Date(stripeSub.trial_end * 1000);
            status = "trialing";
          }
        } catch {
          // Fall through with defaults
        }

        await db.subscription.upsert({
          where: { userId },
          update: {
            stripeSubscriptionId: session.subscription as string,
            stripeCustomerId: session.customer as string,
            plan,
            status,
            billingInterval,
            ...(trialEnd ? { trialEnd } : {}),
          },
          create: {
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            plan,
            status,
            billingInterval,
            ...(trialEnd ? { trialEnd } : {}),
          },
        });
      }
      break;
    }

    // ─── 2. Subscription created (backup handler) ────────────────
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;
      if (!userId) break;

      const item = subscription.items?.data?.[0];
      const priceId = item?.price?.id;
      const plan = priceId ? planFromPriceId(priceId) : (subscription.metadata?.plan ?? null);
      if (!plan) break;

      const status = mapStripeStatus(subscription.status);
      const billingInterval = extractBillingInterval(subscription);
      const periodStart = item?.current_period_start;
      const periodEnd = item?.current_period_end;

      await db.subscription.upsert({
        where: { userId },
        update: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
          plan,
          status,
          billingInterval,
          ...(subscription.trial_end ? { trialEnd: new Date(subscription.trial_end * 1000) } : {}),
          ...(periodStart ? { currentPeriodStart: new Date(periodStart * 1000) } : {}),
          ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        create: {
          userId,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id,
          plan,
          status,
          billingInterval,
          ...(subscription.trial_end ? { trialEnd: new Date(subscription.trial_end * 1000) } : {}),
          ...(periodStart ? { currentPeriodStart: new Date(periodStart * 1000) } : {}),
          ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });
      break;
    }

    // ─── 3. Subscription updated ─────────────────────────────────
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      // Try to find existing record by stripeSubscriptionId
      const existingSub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });

      // Determine userId from existing record or metadata
      const userId = existingSub?.userId ?? subscription.metadata?.userId;
      if (!userId) break;

      const item = subscription.items?.data?.[0];
      const priceId = item?.price?.id;
      const plan = priceId ? planFromPriceId(priceId) : null;
      const status = mapStripeStatus(subscription.status);
      const billingInterval = extractBillingInterval(subscription);
      const periodStart = item?.current_period_start;
      const periodEnd = item?.current_period_end;

      const updateData = {
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
        status,
        billingInterval,
        ...(plan ? { plan } : {}),
        ...(subscription.trial_end ? { trialEnd: new Date(subscription.trial_end * 1000) } : {}),
        ...(periodStart ? { currentPeriodStart: new Date(periodStart * 1000) } : {}),
        ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };

      await db.subscription.upsert({
        where: { userId },
        update: updateData,
        create: {
          userId,
          ...updateData,
          plan: plan ?? "none",
        },
      });
      break;
    }

    // ─── 4. Subscription deleted ─────────────────────────────────
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const sub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (sub) {
        // Set status to canceled but keep plan for reference
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "canceled" },
        });
      }
      break;
    }

    // ─── 5. Trial ending soon ────────────────────────────────────
    case "customer.subscription.trial_will_end": {
      // Log for future email notification. No DB action needed now.
      const subscription = event.data.object as Stripe.Subscription;
      console.log(
        `[Webhook] Trial ending soon for subscription ${subscription.id}`,
        subscription.trial_end
          ? `at ${new Date(subscription.trial_end * 1000).toISOString()}`
          : ""
      );
      break;
    }

    // ─── 6. Invoice paid ─────────────────────────────────────────
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      // Stripe v20: subscription is at parent.subscription_details.subscription
      const subDetails = invoice.parent?.subscription_details;
      const subscriptionId =
        typeof subDetails?.subscription === "string"
          ? subDetails.subscription
          : subDetails?.subscription?.id;
      if (!subscriptionId) break;

      const sub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (sub && sub.status !== "active") {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "active" },
        });
      }
      break;
    }

    // ─── 7. Invoice payment failed ───────────────────────────────
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // Stripe v20: subscription is at parent.subscription_details.subscription
      const subDetails = invoice.parent?.subscription_details;
      const subscriptionId =
        typeof subDetails?.subscription === "string"
          ? subDetails.subscription
          : subDetails?.subscription?.id;
      if (!subscriptionId) break;

      const sub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (sub) {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "past_due" },
        });
      }
      break;
    }
    }
  } catch (error) {
    // H4: release the claim so Stripe's automatic retry re-processes this
    // event instead of being deduped against a dead delivery.
    console.error(
      `[billing-webhook] ${event.type} (${event.id}) failed; claim released for retry:`,
      error
    );
    await db.stripeWebhookEvent
      .deleteMany({ where: { stripeEventId: event.id } })
      .catch(() => {});
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
