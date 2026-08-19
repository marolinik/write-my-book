/**
 * DB-backed counters for the Free tier.
 *
 * Split from `./free-tier` (pure) so the constants + derivation stay
 * db-free and trivially testable. Everything here reads/writes real rows:
 *  - word cap        → sum of Book.wordCount
 *  - session cap     → count of AgentSession rows this UTC month
 *  - concurrency     → count of running AgentSession rows
 *  - ghost / inline  → FreeTierUsage per-UTC-day counters
 *
 * Increment-on-SUCCESS only (D-36 lesson: never advance state on failure).
 * The check-then-increment race can leak a few over-cap calls — ACCEPTED for
 * these soft business caps. This pattern is FORBIDDEN for the Phase B dollar
 * ledger, which must use atomic conditional decrement.
 */

import { db } from "@/lib/db";
import { stripe } from "./stripe-client";
import {
  FREE_TIER,
  isFreeTier,
  isFreeTierEnabled,
  utcDayKey,
  utcMonthStart,
  type FreeTierSubscriptionShape,
} from "./free-tier";

/**
 * Whether `sub` puts a user under LIVE Free-tier ENFORCEMENT.
 *
 * This is `isFreeTier` (the pure derivation) guarded by the two conditions
 * under which Free caps must NOT apply — mirroring the `!stripe` allow-all that
 * already sits above the Free branch in `checkPlanAccess`:
 *  - `!stripe`  → self-hosted / billing-disabled: no Stripe key, no Subscription
 *    rows, so `isFreeTier(null)` would wrongly mark EVERY user Free and enforce
 *    daily meters / the fence / the index cap on a self-hosted deploy. These
 *    deploys must inherit NO caps.
 *  - `!isFreeTierEnabled()` → the FREE_TIER_DISABLED rollback lever: behave
 *    exactly as before the Free tier shipped (no meters, no fence, no index
 *    cap; plan-gating separately makes inactive subs read-only).
 *
 * Every Free ENFORCEMENT site OUTSIDE plan-gating (daily meters, concurrency
 * fence, prose-index cap) MUST route through this, never bare `isFreeTier`.
 */
export function isFreeTierUser(
  sub: FreeTierSubscriptionShape | null | undefined
): boolean {
  if (!stripe) return false;
  if (!isFreeTierEnabled()) return false;
  return isFreeTier(sub);
}

/**
 * A still-"running" AgentSession older than this is treated as crashed/stale
 * and EXCLUDED from the concurrency fence. Without this bound a crash mid-run
 * (the agent-route catch never marks the just-created session failed, and no
 * sweeper exists) leaves a permanent "running" row that would lock a Free
 * writer out of ALL agent sessions forever (finding 9). Chosen to comfortably
 * superset any interactive workflow's serverCeilingMs =
 * (estimatedMaxMinutes + 30) min, so a genuinely live session is never
 * miscounted as stale; a crashed row simply ages out within this window.
 */
const STALE_RUNNING_SESSION_MS = 2 * 60 * 60 * 1000; // 2h

/** Which daily meter a call draws down. */
export type DailyMeter = "ghost" | "inline";

/** Sum of Book.wordCount across all of a user's books (incl. archived). */
export async function sumOwnedWordCount(userId: string): Promise<number> {
  const agg = await db.book.aggregate({
    where: { userId },
    _sum: { wordCount: true },
  });
  return agg._sum.wordCount ?? 0;
}

/** Agent sessions started since the 1st of the current UTC month. */
export async function countAgentSessionsThisMonth(userId: string): Promise<number> {
  return db.agentSession.count({
    where: { userId, startedAt: { gte: utcMonthStart() } },
  });
}

/**
 * Currently-running agent sessions for a user, EXCLUDING stale/crashed rows.
 * A "running" row older than STALE_RUNNING_SESSION_MS is treated as crashed and
 * not counted, so a mid-run crash can never permanently fence a Free writer.
 */
export async function countRunningSessions(userId: string): Promise<number> {
  return db.agentSession.count({
    where: {
      userId,
      status: "running",
      startedAt: { gte: new Date(Date.now() - STALE_RUNNING_SESSION_MS) },
    },
  });
}

/**
 * Free-tier concurrency fence: at most one running agent session. Returns
 * `{ allowed: true }` for any paid user (never fenced) and for Free users
 * under the cap.
 */
export async function checkConcurrencyFence(
  userId: string
): Promise<{ allowed: boolean; reason?: string; upgradeToTier?: string }> {
  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!isFreeTierUser(sub)) return { allowed: true };

  const running = await countRunningSessions(userId);
  if (running >= FREE_TIER.maxConcurrentSessions) {
    return {
      allowed: false,
      reason:
        "One AI session at a time on the Free plan — your current session is still running.",
      upgradeToTier: "indie",
    };
  }
  return { allowed: true };
}

/** Result of consulting a daily meter. */
export interface DailyMeterResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

/** Read a Free user's daily meter and compare to its FREE_TIER limit. */
export async function checkDailyMeter(
  userId: string,
  meter: DailyMeter
): Promise<DailyMeterResult> {
  const row = await db.freeTierUsage.findUnique({
    where: { userId_day: { userId, day: utcDayKey() } },
  });
  const used =
    meter === "ghost"
      ? row?.ghostTextCalls ?? 0
      : row?.inlineEditCalls ?? 0;
  const limit =
    meter === "ghost" ? FREE_TIER.dailyGhostText : FREE_TIER.dailyInlineEdit;
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, used, limit, remaining };
}

/**
 * Increment a daily meter by one. Call ONLY after a successful, billable
 * result — never on failure. Atomic `{ increment: 1 }` upsert keyed on
 * (userId, day).
 */
export async function recordDailyUse(
  userId: string,
  meter: DailyMeter
): Promise<void> {
  const day = utcDayKey();
  const field =
    meter === "ghost"
      ? { ghostTextCalls: { increment: 1 } }
      : { inlineEditCalls: { increment: 1 } };
  const created =
    meter === "ghost" ? { ghostTextCalls: 1 } : { inlineEditCalls: 1 };
  try {
    await db.freeTierUsage.upsert({
      where: { userId_day: { userId, day } },
      update: field,
      create: { userId, day, ...created },
    });
  } catch (err) {
    // A meter-write failure must NEVER fail an already-billed response: callers
    // invoke this AFTER usageRecord.create + a successful reply. Worst case we
    // under-count one soft-cap tick (the safe direction). Logged, never thrown.
    console.error("[free-tier] recordDailyUse failed", { userId, meter, err });
  }
}

/** Snapshot for billing/usage surfaces. Real numbers, honest walls (A10). */
export interface FreeTierSnapshot {
  sessionsUsed: number;
  sessionsLimit: number;
  ghostUsedToday: number;
  inlineUsedToday: number;
  aiWordsUsed: number;
  aiWordsLimit: number;
}

export async function getFreeTierSnapshot(userId: string): Promise<FreeTierSnapshot> {
  const [sessionsUsed, usageRow, aiWordsUsed] = await Promise.all([
    countAgentSessionsThisMonth(userId),
    db.freeTierUsage.findUnique({
      where: { userId_day: { userId, day: utcDayKey() } },
    }),
    sumOwnedWordCount(userId),
  ]);
  return {
    sessionsUsed,
    sessionsLimit: FREE_TIER.monthlyAgentSessions,
    ghostUsedToday: usageRow?.ghostTextCalls ?? 0,
    inlineUsedToday: usageRow?.inlineEditCalls ?? 0,
    aiWordsUsed,
    aiWordsLimit: FREE_TIER.maxAiEligibleWords,
  };
}
