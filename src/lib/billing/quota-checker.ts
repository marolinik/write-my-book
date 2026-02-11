import { db } from "@/lib/db";
import { PLANS, type PlanKey } from "./stripe-client";

type QuotaAction = "create_book" | "create_series" | "use_opus" | "export_advanced";

export async function checkQuota(
  userId: string,
  action: QuotaAction
): Promise<{ allowed: boolean; reason?: string; currentPlan: string }> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  const plan = (sub?.plan ?? "free") as PlanKey;
  const planDef = PLANS[plan];

  switch (action) {
    case "create_book": {
      const bookCount = await db.book.count({ where: { userId } });
      if (bookCount >= planDef.maxBooks) {
        return {
          allowed: false,
          reason: `Your ${planDef.name} plan allows up to ${planDef.maxBooks} book${planDef.maxBooks === 1 ? "" : "s"}. Upgrade to create more.`,
          currentPlan: plan,
        };
      }
      return { allowed: true, currentPlan: plan };
    }
    case "create_series": {
      if (plan === "free" || plan === "starter") {
        return {
          allowed: false,
          reason: "Series management requires the Pro plan or higher.",
          currentPlan: plan,
        };
      }
      return { allowed: true, currentPlan: plan };
    }
    case "use_opus": {
      // Opus is available on all plans (BYOK)
      return { allowed: true, currentPlan: plan };
    }
    case "export_advanced": {
      if (plan === "free") {
        return {
          allowed: false,
          reason: "Advanced export formats require Starter plan or higher.",
          currentPlan: plan,
        };
      }
      return { allowed: true, currentPlan: plan };
    }
    default:
      return { allowed: true, currentPlan: plan };
  }
}
