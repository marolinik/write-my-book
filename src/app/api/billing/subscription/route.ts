import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS, type PlanKey } from "@/lib/billing";

export async function GET() {
  try {
    const user = await requireUser();

    const sub = await db.subscription.findUnique({
      where: { userId: user.id },
    });

    const plan = (sub?.plan ?? "free") as PlanKey;
    const planDef = PLANS[plan];

    return NextResponse.json({
      plan,
      planName: planDef.name,
      price: planDef.price,
      features: planDef.features,
      status: sub?.status ?? "active",
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      currentPeriodEnd: sub?.currentPeriodEnd,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
