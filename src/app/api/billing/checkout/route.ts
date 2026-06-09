import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, PLANS, type PlanKey } from "@/lib/billing";
import { checkoutSchema } from "@/lib/validation";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 503 }
      );
    }

    const user = await requireUser();
    const body = await req.json();

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
    let sub = await db.subscription.findUnique({
      where: { userId: user.id },
    });

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

    // Build checkout session config
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/settings/billing?success=true`,
      cancel_url: `${req.nextUrl.origin}/settings/billing?canceled=true`,
      metadata: { userId: user.id, plan, billingInterval },
    };

    // Add trial for Indie and Professional only (trialDays > 0)
    if (planDef.trialDays > 0) {
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
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
