import { db } from "@/lib/db";
import { stripe, PLANS, type PlanKey } from "./stripe-client";
import {
  FREE_TIER,
  isFreeTier,
  isFreeTierEnabled,
  type FreeTierSubscriptionShape,
} from "./free-tier";
import {
  countAgentSessionsThisMonth,
  sumOwnedWordCount,
} from "./free-tier-meters";

export type PlanAction =
  | "create_book"
  | "create_series"
  | "run_agent"
  | "run_batch"
  | "use_analytics"
  | "export";

export interface PlanAccessResult {
  allowed: boolean;
  reason?: string;
  upgradeToTier?: string;
}

/**
 * Centralized plan access check. Given a userId and action, returns whether
 * the user is allowed to perform it, with upgrade guidance if not.
 *
 * Key invariants (must survive review):
 *  - `export` is ALWAYS allowed (never hold writers' work hostage).
 *  - Self-hosted / billing-disabled (`!stripe`) is allow-all and sits ABOVE
 *    all Free logic — self-hosted must never inherit Free caps.
 *  - "Free" is a DERIVED state (`isFreeTier`), not a stored plan. No-sub /
 *    none / canceled / expired-trial users get 1 writable book + capped AI
 *    instead of a read-only lockout.
 */
export async function checkPlanAccess(
  userId: string,
  action: PlanAction
): Promise<PlanAccessResult> {
  // Export always allowed — never hold writers' work hostage.
  if (action === "export") {
    return { allowed: true };
  }

  // Self-hosted / billing-disabled mode: without Stripe configured there are
  // no plans to gate on. Documented contract (.env.example): "billing features
  // disabled without these" — disabled means open, not read-only. This MUST
  // stay above the Free logic so self-hosted deploys never inherit Free caps.
  if (!stripe) {
    return { allowed: true };
  }

  const sub = await db.subscription.findUnique({ where: { userId } });

  // Free tier — the derived state: no row / none / canceled / expired-trial.
  if (isFreeTier(sub)) {
    if (!isFreeTierEnabled()) {
      // Rollback lever (FREE_TIER_DISABLED=1): behave exactly as before the
      // Free tier shipped — inactive/expired subscriptions are read-only.
      return legacyInactiveDeny(sub);
    }
    return evaluateFreeTierAccess(userId, action);
  }

  // Paid path (active, trialing-with-live-trial, past_due) — unchanged.
  const plan = sub!.plan as PlanKey;
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
      // Any active subscription (active, trialing with valid trial, past_due)
      // can run agents — unlimited.
      return { allowed: true };
    }

    case "run_batch": {
      // All paid tiers have batch/overnight today via the agent-session grant.
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

/**
 * Free-tier limit evaluation. All limits come from `FREE_TIER` (no hardcoding).
 * Typing, autosave, versions and export are NEVER routed here — the caller
 * only asks about AI actions, book creation, and paid-wall features.
 */
async function evaluateFreeTierAccess(
  userId: string,
  action: PlanAction
): Promise<PlanAccessResult> {
  switch (action) {
    case "create_book": {
      // Count ALL rows incl. archived — archive-cycling mints no slot.
      const bookCount = await db.book.count({ where: { userId } });
      if (bookCount < FREE_TIER.maxBooks) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Free plan includes ${FREE_TIER.maxBooks} book. Upgrade to Indie for 2 active books and unlimited AI runs.`,
        upgradeToTier: "indie",
      };
    }

    case "run_agent": {
      // (a) monthly session cap AND (b) AI-eligible word cap — both must pass.
      const sessionCount = await countAgentSessionsThisMonth(userId);
      if (sessionCount >= FREE_TIER.monthlyAgentSessions) {
        return {
          allowed: false,
          reason: `You've used ${FREE_TIER.monthlyAgentSessions} of ${FREE_TIER.monthlyAgentSessions} free AI sessions this month. They reset on the 1st (UTC). Upgrade to Indie for unlimited runs.`,
          upgradeToTier: "indie",
        };
      }
      const words = await sumOwnedWordCount(userId);
      if (words > FREE_TIER.maxAiEligibleWords) {
        return {
          allowed: false,
          reason: `Free plan includes AI on your first ${FREE_TIER.maxAiEligibleWords.toLocaleString("en-US")} words. Your writing, autosave, and export are never limited — upgrade to Indie for unlimited AI.`,
          upgradeToTier: "indie",
        };
      }
      return { allowed: true };
    }

    case "create_series":
    case "use_analytics": {
      // Pro wall (unchanged) — same copy paid users see.
      return {
        allowed: false,
        reason: `${action === "create_series" ? "Series management" : "Advanced analytics"} requires the Professional plan or higher.`,
        upgradeToTier: "professional",
      };
    }

    case "run_batch": {
      // Batch/overnight is a paid wall — the BullMQ worker never sees Free.
      return {
        allowed: false,
        reason: "Overnight batch runs are part of the Indie plan.",
        upgradeToTier: "indie",
      };
    }

    default:
      return { allowed: true };
  }
}

/** Legacy read-only deny, used only when FREE_TIER_DISABLED=1. */
function legacyInactiveDeny(
  sub: FreeTierSubscriptionShape | null | undefined
): PlanAccessResult {
  const expiredTrial = sub?.status === "trialing";
  return {
    allowed: false,
    reason: expiredTrial
      ? "Your trial has expired. Subscribe to continue using this feature."
      : "Your subscription is inactive. Subscribe to access this feature.",
    upgradeToTier: "indie",
  };
}
