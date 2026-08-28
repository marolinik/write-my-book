import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, PLANS, type PlanKey } from "@/lib/billing";
import { checkoutSchema } from "@/lib/validation";
import type Stripe from "stripe";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

export async function POST(req: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 503 }
      );
    }

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

    // Fetch once — used by the double-subscribe guard here and for the
    // Stripe customer id below.
    let sub = await db.subscription.findUnique({
      where: { userId: user.id },
    });

    // One trial per customer: the unique-per-user Subscription row retains
    // trialEnd from any prior trial, so a repeat checkout is paid-from-day-1.
    // Computed from the ORIGINAL row before any mutation below.
    const hasHadTrial = !!sub?.trialEnd;

    // D-06 guard: a user with a live subscription must change plans via the
    // billing portal (which prorates the existing subscription). Creating a
    // fresh Checkout session here would spin up a second, parallel Stripe
    // subscription and double-bill the writer. Mirrors plan-gating semantics:
    // active/past_due are live; trialing counts only while the trial is live.
    const hasLiveSubscription =
      !!sub &&
      (sub.status === "active" ||
        sub.status === "past_due" ||
        (sub.status === "trialing" &&
          (!sub.trialEnd || sub.trialEnd.getTime() > Date.now())));

    if (hasLiveSubscription) {
      return NextResponse.json(
        {
          error:
            "You already have an active subscription. To change plans, use Manage Subscription (the billing portal) — plan changes there are prorated automatically.",
          code: "already_subscribed",
        },
        { status: 409 }
      );
    }

    // Founder slot availability check (atomic)
    if (plan === "founder") {
      const slotCheck = await db.$transaction(async (tx) => {
        const count = await tx.founderSlot.count();
        if (count >= 200) {
          return { available: false, reason: "Founder spots are full. All 200 have been claimed." };
        }

        const existing = await tx.founderSlot.findUnique({
          where: { userId: user.id },
        });
        if (existing) {
          return { available: false, reason: "You already have a Founder slot." };
        }

        return { available: true };
      });

      if (!slotCheck.available) {
        return NextResponse.json(
          { error: slotCheck.reason },
          { status: 400 }
        );
      }
    }

    // Get or create Stripe customer
    let customerId = sub?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      if (!sub) {
        sub = await db.subscription.create({
          data: {
            userId: user.id,
            stripeCustomerId: customerId,
            plan: "none",
            status: "none",
          },
        });
      } else {
        await db.subscription.update({
          where: { id: sub.id },
          data: { stripeCustomerId: customerId },
        });
      }
    }

    // Build the browser-reachable origin. req.nextUrl.origin can be
    // "http://0.0.0.0:3000" in the containerized dev stack (container's own
    // advertised hostname) — a non-navigable host for the user's browser
    // (Priya test hit ERR_ADDRESS_INVALID). NEXT_PUBLIC_APP_URL is the
    // canonical product-origin fallback (docs/env-vars.md).
    const origin =
      process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

    // Build checkout session config
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
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
    if (planDef.trialDays > 0 && !hasHadTrial) {
      sessionConfig.payment_method_collection = "if_required";
      sessionConfig.subscription_data = {
        trial_period_days: planDef.trialDays,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return NextResponse.json({ url: session.url });
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
