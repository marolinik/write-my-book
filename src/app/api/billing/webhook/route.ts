import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { stripe, PLANS } from "@/lib/billing";
import { claimFounderSlot } from "@/lib/billing/founder-slots";
import { cancelStripeSubscription } from "@/lib/billing/stripe-cancel";
import type Stripe from "stripe";

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * A Founder purchase completed after every slot was taken (sessions opened at
 * 199 can all complete). The writer is not made a Founder: the subscription is
 * canceled at once so it never renews, the row records it as canceled (they
 * are on Free and can buy another plan), and the first charge is flagged for
 * a refund. A failed cancel throws, so Stripe retries the whole event.
 */
async function refuseFounderOverCap(
  stripeClient: Stripe,
  session: Stripe.Checkout.Session,
  userId: string,
  billingInterval: string
): Promise<void> {
  const subscriptionId = session.subscription as string;
  const customerId = idOf(session.customer);
  logger.error(
    "[billing-webhook] Founder purchase completed after all slots were claimed: subscription canceled, REFUND OWED",
    new Error("founder slot cap reached"),
    {
      userId,
      checkoutSessionId: session.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      stripeInvoiceId: idOf(session.invoice),
    }
  );

  await cancelStripeSubscription(stripeClient, subscriptionId);

  const data = {
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    plan: "founder",
    status: "canceled",
    billingInterval,
    pendingCheckoutSessionId: null,
  };
  await db.subscription.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/**
 * Who a Stripe customer belongs to. Checkout stores the customer on the
 * writer's row before Stripe ever bills it, so a live writer always has a row
 * carrying it; with no such row, the customer's own userId metadata decides.
 * A customer we did not create (no userId) is "unknown", never an orphan.
 */
async function customerOwner(
  stripeClient: Stripe,
  customerId: string | null
): Promise<"live_writer" | "deleted_writer" | "unknown"> {
  if (!customerId) return "unknown";
  const row = await db.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (row) return "live_writer";

  const customer = await stripeClient.customers.retrieve(customerId);
  if ((customer as Stripe.DeletedCustomer).deleted) return "deleted_writer";
  const ownerId = (customer as Stripe.Customer).metadata?.userId;
  if (!ownerId) return "unknown";
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  return owner ? "live_writer" : "deleted_writer";
}

/**
 * invoice.paid for a subscription no row points at. Either the writer deleted
 * their account and Stripe is still billing a subscription nobody owns, or
 * this invoice arrived before checkout.session.completed wrote the row. The
 * orphan is canceled so it never renews and the charge is flagged for a
 * refund; the race is only logged. Money moved either way, so it is never
 * acknowledged silently. A failed cancel throws, so Stripe retries.
 */
async function handlePaidInvoiceWithoutRow(
  stripeClient: Stripe,
  invoice: Stripe.Invoice,
  subscriptionId: string
): Promise<void> {
  const customerId = idOf(invoice.customer);
  const context = {
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    stripeInvoiceId: invoice.id,
  };

  switch (await customerOwner(stripeClient, customerId)) {
    case "deleted_writer":
      logger.error(
        "[billing-webhook] invoice.paid for a deleted writer's subscription: canceling it, REFUND OWED",
        new Error("orphaned subscription billed"),
        context
      );
      await cancelStripeSubscription(stripeClient, subscriptionId);
      return;
    case "live_writer":
      logger.warn(
        "[billing-webhook] invoice.paid arrived before its subscription was recorded",
        context
      );
      return;
    case "unknown":
      logger.error(
        "[billing-webhook] invoice.paid for a subscription no writer is linked to; left running, check it by hand",
        new Error("unlinked subscription billed"),
        context
      );
      return;
  }
}

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
        // The Founder cap is enforced here, where the slot is taken — not at
        // checkout, which reserves nothing. A purchase that completes after
        // the last slot went is refused rather than granted as slot 201.
        if (plan === "founder") {
          const claim = await claimFounderSlot(userId);
          if (claim === "full") {
            await refuseFounderOverCap(stripe, session, userId, billingInterval);
            break;
          }
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
            // This session reached its terminal success state — clear the
            // pending-session marker so a future checkout starts fresh and
            // the dedup guard never reuses a completed session.
            pendingCheckoutSessionId: null,
            ...(trialEnd ? { trialEnd } : {}),
          },
          create: {
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            plan,
            status,
            billingInterval,
            pendingCheckoutSessionId: null,
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
      let status = mapStripeStatus(subscription.status);
      const billingInterval = extractBillingInterval(subscription);
      const periodStart = item?.current_period_start;
      const periodEnd = item?.current_period_end;

      // Cancellation-resurrection guard: this event may be a stale/sibling
      // delivery arriving AFTER the writer already canceled. If it claims a
      // live status while our row currently says canceled, confirm against
      // Stripe's CURRENT subscription state before flipping back to active —
      // otherwise a delayed updated event could resurrect paid access for a
      // canceled subscription. Downgrade events (reporting canceled) are
      // authoritative and never need this check.
      if (
        existingSub?.status === "canceled" &&
        (status === "active" || status === "trialing")
      ) {
        try {
          const live = await stripe.subscriptions.retrieve(subscription.id);
          const liveStatus = mapStripeStatus(live.status);
          if (liveStatus !== status) {
            // Stripe disagrees with this event — trust Stripe's live state.
            status = liveStatus;
          }
        } catch {
          // Stripe unreachable: do NOT resurrect a canceled subscriber from a
          // possibly-stale event. Keep the row canceled by overriding to the
          // canonical canceled status already on the row.
          status = existingSub.status;
        }
      }

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
      if (!sub) {
        await handlePaidInvoiceWithoutRow(stripe, invoice, subscriptionId);
        break;
      }

      // Reconcile against Stripe's CURRENT subscription state, never the
      // event's happy-path alone. A DELAYED invoice.paid can arrive after the
      // writer already canceled — flipping this row to "active" on that stale
      // event would resurrect paid access for a canceled subscription. Only
      // promote to active when Stripe itself still reports a live status.
      try {
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const liveStatus = mapStripeStatus(stripeSub.status);
        if (liveStatus === "active" || liveStatus === "trialing") {
          if (sub.status !== "active") {
            await db.subscription.update({
              where: { id: sub.id },
              data: { status: "active" },
            });
          }
        } else {
          // Stripe says it is no longer live (e.g. now canceled/unpaid) —
          // apply that reconciled status instead of resurrecting. last-write-
          // wins with the freshest server truth.
          await db.subscription.update({
            where: { id: sub.id },
            data: {
              status: liveStatus,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
            },
          });
        }
      } catch (stripeErr) {
        // Stripe unreachable: err on the side of NOT granting access from a
        // stale event — keep the current row untouched rather than resurrect.
        console.error(
          `[billing-webhook] invoice.paid reconcile failed (staying put):`,
          stripeErr
        );
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
