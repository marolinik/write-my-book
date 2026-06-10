import { db } from "@/lib/db";
import { stripe, PLANS, type PlanKey } from "./stripe-client";

export type PlanAction =
  | "create_book"
  | "create_series"
  | "run_agent"
  | "use_analytics"
  | "export";

/**
 * Centralized plan access check. Given a userId and action, returns
 * whether the user is allowed to perform it, with upgrade guidance if not.
 *
 * Key invariant: export is ALWAYS allowed regardless of subscription state.
 */
export async function checkPlanAccess(
  userId: string,
  action: PlanAction
): Promise<{ allowed: boolean; reason?: string; upgradeToTier?: string }> {
  // Export always allowed — never hold writers' work hostage
  if (action === "export") {
    return { allowed: true };
  }

  // Self-hosted / billing-disabled mode: without Stripe configured there
  // are no plans to gate on. Documented contract (.env.example): "billing
  // features disabled without these" — disabled means open, not read-only.
  if (!stripe) {
    return { allowed: true };
  }

  const sub = await db.subscription.findUnique({ where: { userId } });

  // No subscription or status "none" or "canceled" → read-only
  if (!sub || sub.status === "none" || sub.status === "canceled") {
    return {
      allowed: false,
      reason: "Your subscription is inactive. Subscribe to access this feature.",
      upgradeToTier: "indie",
    };
  }

  // Trial expired without payment method → treat as canceled
  if (sub.status === "trialing" && sub.trialEnd && new Date() > sub.trialEnd) {
    return {
      allowed: false,
      reason: "Your trial has expired. Subscribe to continue using this feature.",
      upgradeToTier: "indie",
    };
  }

  // past_due: still allow access (Stripe retries payment), but warn
  // Active subscription statuses: "active", "trialing", "past_due"
  const plan = sub.plan as PlanKey;
  const planDef = PLANS[plan];

  if (!planDef) {
    return {
      allowed: false,
      reason: "Unknown plan. Please contact support.",
      upgradeToTier: "indie",
    };
  }

  switch (action) {
    case "create_book": {
      const bookCount = await db.book.count({ where: { userId } });
      if (bookCount >= planDef.maxBooks) {
        return {
          allowed: false,
          reason: `Your ${planDef.name} plan allows ${planDef.maxBooks === Infinity ? "unlimited" : planDef.maxBooks} active books. Upgrade to create more.`,
          upgradeToTier: "professional",
        };
      }
      return { allowed: true };
    }

    case "create_series":
    case "use_analytics": {
      if (!["professional", "publisher", "founder"].includes(plan)) {
        return {
          allowed: false,
          reason: `${action === "create_series" ? "Series management" : "Advanced analytics"} requires the Professional plan or higher.`,
          upgradeToTier: "professional",
        };
      }
      return { allowed: true };
    }

    case "run_agent": {
      // Any active subscription (active, trialing with valid trial, past_due) can run agents
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}
