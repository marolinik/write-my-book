import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { stripe, PLANS } from "@/lib/billing";
import { cancelStripeSubscription } from "@/lib/billing/stripe-cancel";
import { applyCompletedCheckout, idOf, keptSubscriptionFor } from "@/lib/billing/apply-checkout";
import { mapStripeStatus } from "@/lib/billing/stripe-status";
import type Stripe from "stripe";

type CustomerOwner =
  | { kind: "live_writer"; userId: string }
  | { kind: "deleted_writer" }
  | { kind: "unknown" };

/**
 * Who a Stripe customer belongs to. Checkout stores the customer on the
 * writer's row before Stripe ever bills it, so a live writer always has a row
 * carrying it; with no such row, the customer's own userId metadata decides.
 * A customer we did not create (no userId) is "unknown", never an orphan.
 */
async function customerOwner(
  stripeClient: Stripe,
  customerId: string | null
): Promise<CustomerOwner> {
  if (!customerId) return { kind: "unknown" };
  const row = await db.subscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { userId: true },
  });
  if (row) return { kind: "live_writer", userId: row.userId };

  const customer = await stripeClient.customers.retrieve(customerId);
  if ((customer as Stripe.DeletedCustomer).deleted) return { kind: "deleted_writer" };
  const ownerId = (customer as Stripe.Customer).metadata?.userId;
  if (!ownerId) return { kind: "unknown" };
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  return owner ? { kind: "live_writer", userId: owner.id } : { kind: "deleted_writer" };
}

/**
 * invoice.paid for a subscription no row points at. Either the writer deleted
 * their account and Stripe is still billing a subscription nobody owns, or the
 * writer's row holds a different live subscription (this one is a duplicate),
 * or this invoice arrived before checkout.session.completed wrote the row. The
 * orphan and the duplicate are canceled so they never renew and the charge is
 * flagged for a refund; the race is only logged. Money moved either way, so it
 * is never acknowledged silently. A failed cancel throws, so Stripe retries;
 * a cancel that already happened counts as done, so a redelivery is harmless.
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

  const owner = await customerOwner(stripeClient, customerId);
  switch (owner.kind) {
    case "deleted_writer":
      logger.error(
        "[billing-webhook] invoice.paid for a deleted writer's subscription: canceling it, REFUND OWED",
        new Error("orphaned subscription billed"),
        context
      );
      await cancelStripeSubscription(stripeClient, subscriptionId);
      return;
    case "live_writer": {
      const keptSubscriptionId = await keptSubscriptionFor(
        stripeClient,
        owner.userId,
        subscriptionId
      );
      if (keptSubscriptionId) {
        logger.error(
          "[billing-webhook] invoice.paid for a second subscription while the writer's recorded one is live: canceling it, REFUND OWED",
          new Error("duplicate subscription billed"),
          { ...context, userId: owner.userId, keptSubscriptionId }
        );
        await cancelStripeSubscription(stripeClient, subscriptionId);
        return;
      }
      logger.warn(
        "[billing-webhook] invoice.paid arrived before its subscription was recorded",
        context
      );
      return;
    }
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
  } catch (error) {
    // A wrong or rotated STRIPE_WEBHOOK_SECRET fails every delivery; payers
    // then depend on the self-heal in GET /subscription. Make it loud.
    logger.error(
      "[billing-webhook] signature verification failed",
      error instanceof Error ? error : new Error(String(error)),
      { hasSignature: true }
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: claim the event; skip only if a completed delivery took it
  if (await claimEvent(event.id, event.type)) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    switch (event.type) {
    // ─── 1. Checkout completed ───────────────────────────────────
    case "checkout.session.async_payment_failed": {
      // Wave 2 review I3: a SEPA or bank debit that failed leaves its
      // subscription active and billing again next period. It was never
      // granted (the session was unpaid); stop it and forget the checkout so
      // the writer can try again.
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = idOf(session.subscription);
      const userId = session.metadata?.userId;
      logger.warn("[billing-webhook] async payment failed; canceling its subscription", {
        userId,
        subscriptionId,
        checkoutSessionId: session.id,
      });
      if (subscriptionId) await cancelStripeSubscription(stripe, subscriptionId);
      if (userId) {
        await db.subscription.updateMany({
          where: { userId, pendingCheckoutSessionId: session.id },
          data: { pendingCheckoutSessionId: null },
        });
      }
      break;
    }

    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // A card checkout completes paid; an async method (SEPA, bank debit)
      // completes unpaid and is granted when its payment succeeds.
      await applyCompletedCheckout(stripe, event.data.object as Stripe.Checkout.Session);
      break;
    }

    // ─── 2. Subscription created (backup handler) ────────────────
    // ─── 3. Subscription updated ─────────────────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      // Only the row that already records this subscription is updated
      // (Wave 2 review C1). A subscription no row holds is granted only
      // through applyCompletedCheckout, which checks the payment, the Founder
      // cap and duplicates; a subscription event never grants on its own.
      const existingSub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (!existingSub) break;
      const userId = existingSub.userId;

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
      // past_due still grants the plan (plan-gating), so only a live row may
      // become past_due: a late failure for a canceled subscription must not
      // give its access back.
      if (sub && (sub.status === "active" || sub.status === "trialing")) {
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
