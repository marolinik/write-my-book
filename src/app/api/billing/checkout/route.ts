import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { stripe, PLANS, type PlanKey } from "@/lib/billing";
import { checkoutSchema } from "@/lib/validation";

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
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    const { plan } = parsed.data;

    const planDef = PLANS[plan as PlanKey];
    if (!("stripePriceId" in planDef) || !planDef.stripePriceId) {
      return NextResponse.json(
        { error: "Plan not available" },
        { status: 400 }
      );
    }

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
            plan: "free",
            status: "active",
          },
        });
      } else {
        await db.subscription.update({
          where: { id: sub.id },
          data: { stripeCustomerId: customerId },
        });
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: planDef.stripePriceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/settings/billing?success=true`,
      cancel_url: `${req.nextUrl.origin}/settings/billing?canceled=true`,
      metadata: { userId: user.id, plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
