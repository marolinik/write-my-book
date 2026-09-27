import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, PLANS, type PlanKey } from "@/lib/billing";
import { FOUNDER_SLOT_CAP } from "@/lib/billing/founder-slots";
import {
  expireCheckoutSession,
  subscriptionIsLive,
} from "@/lib/billing/stripe-cancel";
import { checkoutSchema } from "@/lib/validation";
import type Stripe from "stripe";
import type { Prisma, Subscription } from "@/generated/prisma/client";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

/**
 * The per-user checkout transaction holds its lock across Stripe calls
 * (retrieve, expire, customer and session create). Prisma's 5 s default could
 * cut it off mid-way on a slow Stripe; this is headroom, not the expected cost.
 */
const CHECKOUT_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/** Everything a checkout needs once the request is validated. */
interface CheckoutIntent {
  user: { id: string; email: string };
  plan: string;
  billingInterval: string;
  priceId: string;
  trialDays: number;
  origin: string;
}

/**
 * D-06: a live subscription changes plan in the billing portal (which prorates
 * it); a second Checkout would start a parallel subscription and double-bill.
 * Mirrors plan-gating: active/past_due are live; trialing only while the trial
 * is.
 */
function hasLiveSubscription(sub: Subscription | null): boolean {
  return (
    !!sub &&
    (sub.status === "active" ||
      sub.status === "past_due" ||
      (sub.status === "trialing" &&
        (!sub.trialEnd || sub.trialEnd.getTime() > Date.now())))
  );
}

function alreadySubscribed(): NextResponse {
  return NextResponse.json(
    {
      error:
        "You already have an active subscription. To change plans, use Manage Subscription (the billing portal) — plan changes there are prorated automatically.",
      code: "already_subscribed",
    },
    { status: 409 }
  );
}

type PendingSession = { kind: "reuse"; url: string } | { kind: "paid" } | { kind: "closed" };

/**
 * What to do with the checkout session this writer already has pending.
 *
 * Still open for the same plan and interval: hand back its url. Open for a
 * different intent (a change of mind between tabs): expire it BEFORE a fresh
 * one is created, so only the newest session can ever be paid; two payable
 * sessions are two live subscriptions. Paid, with its subscription still live
 * (the webhook has not landed yet): the writer is subscribed. Anything else is
 * finished, and a fresh session follows.
 */
async function settlePendingSession(
  stripeClient: Stripe,
  sessionId: string,
  intent: CheckoutIntent
): Promise<PendingSession> {
  let pending: Stripe.Checkout.Session | null;
  try {
    pending = await stripeClient.checkout.sessions.retrieve(sessionId);
  } catch {
    // Session no longer retrievable (deleted server-side): nothing left to
    // pay; the fresh session's id replaces it.
    return { kind: "closed" };
  }

  if (pending.status === "open") {
    // Compared against the pending session's own metadata (the values we
    // stamped at creation), so no extra columns are needed.
    const sameIntent =
      pending.metadata?.plan === intent.plan &&
      (pending.metadata?.billingInterval ?? "monthly") === intent.billingInterval;
    if (sameIntent && pending.url) return { kind: "reuse", url: pending.url };
    // Throws if Stripe cannot confirm it closed: no second session then.
    pending = await expireCheckoutSession(stripeClient, sessionId);
  }

  if (pending?.status === "complete") {
    const subscriptionId =
      typeof pending.subscription === "string"
        ? pending.subscription
        : pending.subscription?.id;
    if (subscriptionId && (await subscriptionIsLive(stripeClient, subscriptionId))) {
      return { kind: "paid" };
    }
  }
  return { kind: "closed" };
}

/**
 * Founder: an early "sold out" answer only. This reserves nothing — any number
 * of sessions can be open at 199 — so the cap itself is enforced when the
 * webhook claims the slot (claimFounderSlot), which refuses a purchase that
 * completes after the last slot went.
 */
async function founderUnavailableReason(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<string | null> {
  const count = await tx.founderSlot.count();
  if (count >= FOUNDER_SLOT_CAP) {
    return `Founder spots are full. All ${FOUNDER_SLOT_CAP} have been claimed.`;
  }
  const existing = await tx.founderSlot.findUnique({ where: { userId } });
  return existing ? "You already have a Founder slot." : null;
}

/** The writer's row and Stripe customer, creating either as needed. */
async function withStripeCustomer(
  tx: Prisma.TransactionClient,
  stripeClient: Stripe,
  user: CheckoutIntent["user"],
  sub: Subscription | null
): Promise<{ rowId: string; customerId: string }> {
  if (sub?.stripeCustomerId) return { rowId: sub.id, customerId: sub.stripeCustomerId };

  const customer = await stripeClient.customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });
  if (!sub) {
    const created = await tx.subscription.create({
      data: {
        userId: user.id,
        stripeCustomerId: customer.id,
        plan: "none",
        status: "none",
      },
    });
    return { rowId: created.id, customerId: customer.id };
  }
  await tx.subscription.update({
    where: { id: sub.id },
    data: { stripeCustomerId: customer.id },
  });
  return { rowId: sub.id, customerId: customer.id };
}

function sessionConfigFor(
  intent: CheckoutIntent,
  customerId: string,
  hasHadTrial: boolean
): Stripe.Checkout.SessionCreateParams {
  const { user, plan, billingInterval, priceId, origin } = intent;
  const config: Stripe.Checkout.SessionCreateParams = {
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings/billing?success=true`,
    cancel_url: `${origin}/settings/billing?canceled=true`,
    metadata: { userId: user.id, plan, billingInterval },
  };

  // Card-free trial for Indie and Professional (trialDays > 0), first trial
  // only. `payment_method_collection: "if_required"` lets the writer start
  // without a card; combined with the shipped `missing_payment_method:
  // "cancel"` the sub auto-cancels on day 14 if no card is added → webhook
  // maps it to `canceled` → plan-gating reinterprets that as Free (a
  // downgrade, never a lockout). Repeat checkouts (hasHadTrial) are
  // paid-from-day-1: no second trial block.
  if (intent.trialDays > 0 && !hasHadTrial) {
    return {
      ...config,
      payment_method_collection: "if_required",
      subscription_data: {
        trial_period_days: intent.trialDays,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        },
      },
    };
  }
  return config;
}

/**
 * The checkout itself, run under the writer's lock: the double-subscribe
 * guard, the pending session's reuse or retirement, and the new session with
 * its id recorded, as one serialised step.
 */
async function checkoutUnderLock(
  tx: Prisma.TransactionClient,
  stripeClient: Stripe,
  intent: CheckoutIntent
): Promise<NextResponse> {
  const { user, plan } = intent;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`wmb-checkout:${user.id}`}))`;

  // Fetch once — used by the double-subscribe guard, the pending-session
  // handling, and the Stripe customer id below.
  const sub = await tx.subscription.findUnique({ where: { userId: user.id } });

  if (hasLiveSubscription(sub)) return alreadySubscribed();

  // Dedup: a session already pending for this user (created, not yet
  // completed by a webhook) is reused, retired, or recognised as paid.
  if (sub?.pendingCheckoutSessionId) {
    const pending = await settlePendingSession(stripeClient, sub.pendingCheckoutSessionId, intent);
    if (pending.kind === "reuse") return NextResponse.json({ url: pending.url });
    if (pending.kind === "paid") return alreadySubscribed();
  }

  if (plan === "founder") {
    const unavailable = await founderUnavailableReason(tx, user.id);
    if (unavailable) return NextResponse.json({ error: unavailable }, { status: 400 });
  }

  // One trial per customer: the unique-per-user Subscription row retains
  // trialEnd from any prior trial, so a repeat checkout is paid-from-day-1.
  // Computed from the ORIGINAL row before any mutation below.
  const hasHadTrial = !!sub?.trialEnd;
  const { rowId, customerId } = await withStripeCustomer(tx, stripeClient, user, sub);

  const session = await stripeClient.checkout.sessions.create(
    sessionConfigFor(intent, customerId, hasHadTrial)
  );

  // Record the pending session id (replacing any stale one) so the dedup
  // above can reuse or retire it. The webhook clears it on completion
  // (checkout.session.completed).
  await tx.subscription.update({
    where: { id: rowId },
    data: { pendingCheckoutSessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}

export async function POST(req: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 503 }
      );
    }
    const stripeClient = stripe;

    const user = await requireUser();
    const body = await parseJsonBody(req);

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { plan, billingInterval } = parsed.data;
    const planDef = PLANS[plan as PlanKey];

    if (!planDef) {
      return NextResponse.json(
        { error: "Unknown plan" },
        { status: 400 }
      );
    }

    // Founder plan is monthly only
    if (plan === "founder" && billingInterval === "annual") {
      return NextResponse.json(
        { error: "Founder plan is monthly only" },
        { status: 400 }
      );
    }

    // Determine price ID based on billing interval
    const priceId =
      billingInterval === "annual" && planDef.stripePriceIds.annual
        ? planDef.stripePriceIds.annual
        : planDef.stripePriceIds.monthly;

    if (!priceId) {
      return NextResponse.json(
        { error: "Plan price not configured. Please contact support." },
        { status: 400 }
      );
    }

    // Build the browser-reachable origin. req.nextUrl.origin can be
    // "http://0.0.0.0:3000" in the containerized dev stack (container's own
    // advertised hostname) — a non-navigable host for the user's browser
    // (Priya test hit ERR_ADDRESS_INVALID). NEXT_PUBLIC_APP_URL is the
    // canonical product-origin fallback (docs/env-vars.md).
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

    const intent: CheckoutIntent = {
      user: { id: user.id, email: user.email },
      plan,
      billingInterval,
      priceId,
      trialDays: planDef.trialDays,
      origin,
    };

    // Serialize checkout per user so two tabs cannot both end up holding a
    // payable session (→ two subscriptions, double billing). The advisory lock
    // is a TRANSACTION lock: taken outside a transaction it ends with its own
    // statement and serialises nothing. Inside this one it is held until
    // commit, across the read of the pending session, its reuse or expiry, and
    // the write of the new one.
    return await db.$transaction(
      (tx) => checkoutUnderLock(tx, stripeClient, intent),
      CHECKOUT_TX_OPTIONS
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
