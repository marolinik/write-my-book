import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stripe } from "@/lib/billing";
import type Stripe from "stripe";

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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan;
      if (userId && plan && session.subscription) {
        await db.subscription.upsert({
          where: { userId },
          update: {
            stripeSubscriptionId: session.subscription as string,
            plan,
            status: "active",
          },
          create: {
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            plan,
            status: "active",
          },
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const sub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (sub) {
        const item = subscription.items?.data?.[0];
        const periodStart = item?.current_period_start;
        const periodEnd = item?.current_period_end;
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            status: subscription.status === "active" ? "active" : "past_due",
            ...(periodStart
              ? { currentPeriodStart: new Date(periodStart * 1000) }
              : {}),
            ...(periodEnd
              ? { currentPeriodEnd: new Date(periodEnd * 1000) }
              : {}),
          },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const sub = await db.subscription.findFirst({
        where: { stripeSubscriptionId: subscription.id },
      });
      if (sub) {
        await db.subscription.update({
          where: { id: sub.id },
          data: { status: "canceled", plan: "free" },
        });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
