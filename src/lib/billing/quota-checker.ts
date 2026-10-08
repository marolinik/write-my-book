import { db } from "@/lib/db";
import { checkPlanAccess, type PlanAction } from "./plan-gating";
import { FREE_TIER } from "./free-tier";
import { checkDailyMeter, isFreeTierUser, type DailyMeter } from "./free-tier-meters";

export type QuotaAction =
  | "create_book"
  | "create_series"
  | "run_agent"
  | "use_analytics"
  | "export"
  | "use_agent_session"
  | "run_batch"
  | "ghost_text"
  | "inline_edit"
  | "polish_scene";

export interface QuotaResult {
  allowed: boolean;
  reason?: string;
  currentPlan: string;
  /** Tier the caller should upgrade to; surfaced so the client can open the modal. */
  upgradeToTier?: string;
  /** Remaining daily-meter budget for ghost-text / inline-edit / polish (Free only). */
  remainingToday?: number;
  /** Whether the user is on the derived Free tier (drives meter recording). */
  isFree?: boolean;
}

/** Map a (possibly legacy/granular) QuotaAction to the underlying PlanAction. */
function toPlanAction(action: QuotaAction): PlanAction {
  switch (action) {
    // Session-shaped AI actions all gate on the same plan check; the daily
    // meter for ghost/inline/polish is layered on AFTER, for Free users only.
    case "use_agent_session":
    case "ghost_text":
    case "inline_edit":
    case "polish_scene":
      return "run_agent";
    case "run_batch":
      return "run_batch";
    default:
      return action;
  }
}

/** Actions that also draw on a Free daily meter, and how a denial names it. */
const METERED_ACTIONS: Partial<Record<QuotaAction, { meter: DailyMeter; limitCopy: string }>> = {
  ghost_text: { meter: "ghost", limitCopy: `${FREE_TIER.dailyGhostText} ghost-text completions` },
  inline_edit: { meter: "inline", limitCopy: `${FREE_TIER.dailyInlineEdit} inline edits` },
  polish_scene: { meter: "polish", limitCopy: `${FREE_TIER.dailyPolishScene} scene polishes` },
};

/**
 * Check whether a user may perform an action based on their subscription.
 * Delegates the plan decision to `checkPlanAccess`, then — for Free users only
 * — layers the ghost-text / inline-edit / scene-polish per-day meter on top.
 *
 * Never silently degrades: a denial always carries an honest `reason` +
 * `upgradeToTier` so the client can route it to the upgrade modal.
 */
export async function checkQuota(
  userId: string,
  action: QuotaAction
): Promise<QuotaResult> {
  const planAction = toPlanAction(action);
  const result = await checkPlanAccess(userId, planAction);

  const sub = await db.subscription.findUnique({ where: { userId } });
  const currentPlan = sub?.plan ?? "none";
  const free = isFreeTierUser(sub);

  if (!result.allowed) {
    return {
      allowed: false,
      reason: result.reason,
      currentPlan,
      upgradeToTier: result.upgradeToTier,
      isFree: free,
    };
  }

  // Free-tier daily meters sit ON TOP of the plan check (which already enforced
  // the word cap + monthly session cap via run_agent). Paid users have no
  // daily meters and skip this entirely.
  const metered = free ? METERED_ACTIONS[action] : undefined;
  if (metered) {
    const daily = await checkDailyMeter(userId, metered.meter);
    if (!daily.allowed) {
      return {
        allowed: false,
        reason: `Free plan includes ${metered.limitCopy} per day. Resets at midnight UTC.`,
        currentPlan,
        upgradeToTier: "indie",
        remainingToday: 0,
        isFree: true,
      };
    }
    return {
      allowed: true,
      currentPlan,
      isFree: true,
      remainingToday: daily.remaining,
    };
  }

  return { allowed: true, currentPlan, isFree: free };
}

/**
 * @deprecated BYOK model -- no platform cost limits. Always returns Infinity.
 * Kept for backward compatibility with existing agent route imports.
 */
export async function getSessionCostLimit(_userId: string): Promise<number> {
  return Infinity;
}
