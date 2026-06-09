import { db } from "@/lib/db";
import { checkPlanAccess, type PlanAction } from "./plan-gating";

export type QuotaAction =
  | "create_book"
  | "create_series"
  | "run_agent"
  | "use_analytics"
  | "export"
  | "use_agent_session";

/**
 * Check whether a user is allowed to perform an action based on their subscription.
 * Delegates to the centralized plan-gating utility.
 *
 * Maps legacy action names to PlanAction:
 * - "use_agent_session" -> "run_agent"
 */
export async function checkQuota(
  userId: string,
  action: QuotaAction
): Promise<{ allowed: boolean; reason?: string; currentPlan: string }> {
  // Map legacy action names
  const planAction: PlanAction = action === "use_agent_session" ? "run_agent" : action;

  const result = await checkPlanAccess(userId, planAction);

  // Fetch current plan for backward compatibility
  const sub = await db.subscription.findUnique({ where: { userId } });
  const currentPlan = sub?.plan ?? "none";

  return {
    allowed: result.allowed,
    reason: result.reason,
    currentPlan,
  };
}

/**
 * @deprecated BYOK model -- no platform cost limits. Always returns Infinity.
 * Kept for backward compatibility with existing agent route imports.
 */
export async function getSessionCostLimit(_userId: string): Promise<number> {
  return Infinity;
}
