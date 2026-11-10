import type Stripe from "stripe";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { claimFounderSlot } from "@/lib/billing/founder-slots";
import { cancelStripeSubscription, subscriptionIsLive } from "@/lib/billing/stripe-cancel";
import { subscriptionFields, type SubscriptionFields } from "@/lib/billing/stripe-status";

// One path from a completed Stripe Checkout to the writer's row, shared by the
// webhook (checkout.session.completed and async_payment_succeeded) and by the
// self-heal that runs when the writer comes back and the webhook never landed.

export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/**
 * A purchase the webhook will not grant. Logged with everything a refund
 * needs, then its subscription is canceled at once so it never renews. A
 * failed cancel throws, so Stripe retries the whole event.
 */
export async function cancelRefusedCheckout(
  stripeClient: Stripe,
  session: Stripe.Checkout.Session,
  userId: string,
  reason: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  const subscriptionId = idOf(session.subscription) as string;
  logger.error(
    `[billing-webhook] ${reason}: subscription canceled, REFUND OWED`,
    new Error(reason),
    {
      userId,
      checkoutSessionId: session.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: idOf(session.customer),
      stripeInvoiceId: idOf(session.invoice),
      ...context,
    }
  );
  await cancelStripeSubscription(stripeClient, subscriptionId);
}

/**
 * A Founder purchase completed after every slot was taken (sessions opened at
 * 199 can all complete). The writer is not made a Founder: the subscription is
 * canceled at once so it never renews, the row records it as canceled (they
 * are on Free and can buy another plan), and the first charge is flagged for
 * a refund.
 */
export async function refuseFounderOverCap(
  stripeClient: Stripe,
  session: Stripe.Checkout.Session,
  userId: string,
  billingInterval: string
): Promise<void> {
  await cancelRefusedCheckout(
    stripeClient,
    session,
    userId,
    "Founder purchase completed after all slots were claimed"
  );

  const data = {
    stripeSubscriptionId: idOf(session.subscription) as string,
    stripeCustomerId: idOf(session.customer),
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
 * One writer, one subscription. When the writer's row already holds a
 * DIFFERENT subscription that Stripe still reports live, `subscriptionId` is
 * a duplicate (two checkouts paid side by side) and that kept id is returned.
 * The one recorded first is always the one kept, in every handler, so whatever
 * order the events arrive in the same subscription survives and the two are
 * never both canceled. Stripe decides "live", not the row, which can lag.
 */
export async function keptSubscriptionFor(
  stripeClient: Stripe,
  userId: string,
  subscriptionId: string
): Promise<string | null> {
  const row = await db.subscription.findFirst({
    where: { userId },
    select: { stripeSubscriptionId: true },
  });
  const kept = row?.stripeSubscriptionId;
  if (!kept || kept === subscriptionId) return null;
  return (await subscriptionIsLive(stripeClient, kept)) ? kept : null;
}

/**
 * The writer is gone. FounderSlot has no foreign key to User, and the row
 * upsert would fail on its own, 500ing on every retry while the subscription
 * kept billing. Nothing is written; the subscription is stopped.
 */
export async function refuseCheckoutForDeletedWriter(
  stripeClient: Stripe,
  session: Stripe.Checkout.Session,
  userId: string
): Promise<void> {
  await cancelRefusedCheckout(
    stripeClient,
    session,
    userId,
    "Checkout completed for an account that no longer exists"
  );
}

/**
 * A second live subscription for one writer. The one their row holds is kept
 * and the row is not overwritten; the new one is canceled. The finished
 * session is no longer pending, so a later checkout never waits on it.
 */
export async function refuseDuplicateCheckout(
  stripeClient: Stripe,
  session: Stripe.Checkout.Session,
  userId: string,
  keptSubscriptionId: string
): Promise<void> {
  await cancelRefusedCheckout(
    stripeClient,
    session,
    userId,
    "Checkout completed for a writer who already has a live subscription",
    { keptSubscriptionId }
  );
  await db.subscription.updateMany({
    where: { userId, pendingCheckoutSessionId: session.id },
    data: { pendingCheckoutSessionId: null },
  });
}

export type ApplyResult =
  | { kind: "applied" }
  | { kind: "unpaid" }
  | { kind: "not-ours" }
  | { kind: "writer-gone" }
  | { kind: "duplicate" }
  | { kind: "founder-full" };

/** A card checkout is "paid"; a checkout that needed no payment is a trial. */
const GRANTABLE_PAYMENT = new Set(["paid", "no_payment_required"]);

/**
 * Grant what a completed checkout bought. Nothing is granted until the money
 * has cleared (an async method such as SEPA completes the session unpaid and
 * grants on checkout.session.async_payment_succeeded). Refusals come before
 * the Founder slot is claimed, so a purchase that is not granted never takes
 * one. The stored status and period come from Stripe, not a hardcoded
 * "active".
 */
export async function applyCompletedCheckout(
  stripeClient: Stripe,
  session: Stripe.Checkout.Session
): Promise<ApplyResult> {
  const userId = session.metadata?.userId;
  const plan = session.metadata?.plan;
  const billingInterval = session.metadata?.billingInterval ?? "monthly";
  const subscriptionId = idOf(session.subscription);
  if (!userId || !plan || !subscriptionId) return { kind: "not-ours" };
  if (!GRANTABLE_PAYMENT.has(session.payment_status)) return { kind: "unpaid" };

  const writer = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!writer) {
    await refuseCheckoutForDeletedWriter(stripeClient, session, userId);
    return { kind: "writer-gone" };
  }
  const keptSubscriptionId = await keptSubscriptionFor(stripeClient, userId, subscriptionId);
  if (keptSubscriptionId) {
    await refuseDuplicateCheckout(stripeClient, session, userId, keptSubscriptionId);
    return { kind: "duplicate" };
  }

  // The Founder cap is enforced here, where the slot is taken — not at
  // checkout, which reserves nothing.
  if (plan === "founder" && (await claimFounderSlot(userId)) === "full") {
    await refuseFounderOverCap(stripeClient, session, userId, billingInterval);
    return { kind: "founder-full" };
  }

  let fields: SubscriptionFields = { status: "active", cancelAtPeriodEnd: false };
  try {
    fields = subscriptionFields(await stripeClient.subscriptions.retrieve(subscriptionId));
  } catch (error) {
    // The session is paid, so "active" is the honest default; the
    // subscription poll fills the period in on the next read.
    logger.warn("[billing] could not read the subscription of a paid checkout", {
      userId,
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const data = {
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: idOf(session.customer),
    plan,
    billingInterval,
    // This session reached its terminal success state, so a future checkout
    // starts fresh and the dedup guard never reuses it.
    pendingCheckoutSessionId: null,
    ...fields,
  };
  await db.subscription.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
  return { kind: "applied" };
}

/**
 * Self-heal for a payment whose webhook never arrived (wrong secret, disabled
 * endpoint). When the row still points at a pending checkout and holds no
 * subscription, ask Stripe whether that checkout completed and apply it.
 */
export async function reconcilePendingCheckout(
  stripeClient: Stripe,
  userId: string
): Promise<boolean> {
  const row = await db.subscription.findUnique({ where: { userId } });
  if (!row?.pendingCheckoutSessionId || row.stripeSubscriptionId) return false;

  const session = await stripeClient.checkout.sessions.retrieve(row.pendingCheckoutSessionId);
  if (session.status !== "complete") return false;
  const result = await applyCompletedCheckout(stripeClient, session);
  return result.kind === "applied";
}
