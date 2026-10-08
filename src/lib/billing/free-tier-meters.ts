/**
 * DB-backed counters for the Free tier.
 *
 * Split from `./free-tier` (pure) so the constants + derivation stay
 * db-free and trivially testable. Everything here reads/writes real rows:
 *  - word cap        → sum of Book.wordCount
 *  - session cap     → AgentSession rows this UTC month, floored by the
 *                      user-keyed FreeTierUsage session-start ledger
 *  - concurrency     → count of running AgentSession rows
 *  - ghost / inline / polish → FreeTierUsage per-UTC-day counters
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
  if (!isFreeTierEnforced()) return false;
  return isFreeTier(sub);
}

/**
 * Whether Free caps are live on this deploy at all (billing configured and the
 * rollback lever off) — the subscription-independent half of `isFreeTierUser`,
 * for callers that can skip the subscription read when nothing is enforced.
 */
export function isFreeTierEnforced(): boolean {
  return !!stripe && isFreeTierEnabled();
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
export type DailyMeter = "ghost" | "inline" | "polish";

type DailyCounterColumn = "ghostTextCalls" | "inlineEditCalls" | "polishSceneCalls";

/** The FreeTierUsage column and FREE_TIER limit behind each daily meter. */
const DAILY_METERS: Record<DailyMeter, { column: DailyCounterColumn; limit: number }> = {
  ghost: { column: "ghostTextCalls", limit: FREE_TIER.dailyGhostText },
  inline: { column: "inlineEditCalls", limit: FREE_TIER.dailyInlineEdit },
  polish: { column: "polishSceneCalls", limit: FREE_TIER.dailyPolishScene },
};

/**
 * The only FreeTierUsage columns the daily meters read. Naming them keeps the
 * reads off `agent_sessions`: production can ship before `prisma db push` adds
 * that column, and a bare findUnique (every column) would then throw on every
 * Free ghost-text / inline-edit check. The session ledger's own reads and
 * writes already degrade on their own.
 */
const DAILY_COUNTERS = { ghostTextCalls: true, inlineEditCalls: true } as const;

/** Sum of Book.wordCount across all of a user's books (incl. archived). */
export async function sumOwnedWordCount(userId: string): Promise<number> {
  const agg = await db.book.aggregate({
    where: { userId },
    _sum: { wordCount: true },
  });
  return agg._sum.wordCount ?? 0;
}

/**
 * Agent sessions started since the 1st of the current UTC month.
 *
 * P7-S13: AgentSession rows cascade with their book, so counting rows alone let
 * a writer reset the cap by deleting a book (20 → 0). The session-start ledger
 * on FreeTierUsage is keyed on the USER and survives the delete. The larger of
 * the two wins: the ledger only exists from the day it shipped, so for that
 * month the rows still count sessions it never saw.
 */
export async function countAgentSessionsThisMonth(userId: string): Promise<number> {
  const monthStart = utcMonthStart();
  const [rows, ledger] = await Promise.all([
    db.agentSession.count({
      where: { userId, startedAt: { gte: monthStart } },
    }),
    sessionStartsSince(userId, monthStart),
  ]);
  return Math.max(rows, ledger);
}

/**
 * Sum of the ledger's session starts from `since` (a UTC month start) on.
 * A read failure falls back to 0 so the rows above still govern — the meter
 * degrades to its old behaviour instead of failing every AI action — and is
 * logged, never swallowed.
 */
async function sessionStartsSince(userId: string, since: Date): Promise<number> {
  try {
    const agg = await db.freeTierUsage.aggregate({
      where: { userId, day: { gte: utcDayKey(since) } },
      _sum: { agentSessions: true },
    });
    return agg._sum.agentSessions ?? 0;
  } catch (err) {
    console.error("[free-tier] session ledger read failed", { userId, err });
    return 0;
  }
}

/**
 * Count one agent-session start in the user-keyed ledger (P7-S13). Call right
 * after the AgentSession row is created, for every plan: the monthly count is
 * plan-agnostic ("started since the 1st, any status"), so a writer who
 * downgrades mid-month is measured the same way. Fire-safe like
 * `recordDailyUse` — the session has already started, so a ledger failure is
 * logged, never thrown.
 */
export async function recordAgentSessionStart(userId: string): Promise<void> {
  const day = utcDayKey();
  try {
    await db.freeTierUsage.upsert({
      where: { userId_day: { userId, day } },
      update: { agentSessions: { increment: 1 } },
      create: { userId, day, agentSessions: 1 },
    });
  } catch (err) {
    console.error("[free-tier] recordAgentSessionStart failed", { userId, err });
  }
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

/**
 * Read a Free user's daily meter and compare to its FREE_TIER limit.
 *
 * Reads only that meter's own column, so a meter added later cannot break the
 * others before `prisma db push` adds its column. The polish meter's read
 * degrades to an empty count when its column is missing (a soft cap, like the
 * session ledger) and logs the failure; ghost and inline still throw, as before.
 */
export async function checkDailyMeter(
  userId: string,
  meter: DailyMeter
): Promise<DailyMeterResult> {
  const { column, limit } = DAILY_METERS[meter];
  const used = await readDailyCounter(userId, meter, column);
  const remaining = Math.max(0, limit - used);
  return { allowed: used < limit, used, limit, remaining };
}

async function readDailyCounter(
  userId: string,
  meter: DailyMeter,
  column: DailyCounterColumn
): Promise<number> {
  const read = async (): Promise<number> => {
    const row = await db.freeTierUsage.findUnique({
      where: { userId_day: { userId, day: utcDayKey() } },
      select: { [column]: true },
    });
    return (row as Partial<Record<DailyCounterColumn, number>> | null)?.[column] ?? 0;
  };
  if (meter !== "polish") return read();
  try {
    return await read();
  } catch (err) {
    console.error("[free-tier] polish meter read failed", { userId, err });
    return 0;
  }
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
  const { column } = DAILY_METERS[meter];
  try {
    await db.freeTierUsage.upsert({
      where: { userId_day: { userId, day } },
      update: { [column]: { increment: 1 } },
      create: { userId, day, [column]: 1 },
      // Nothing is read back; not returning every column keeps agent_sessions
      // out of this statement's result (see DAILY_COUNTERS).
      select: { id: true },
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
      select: DAILY_COUNTERS,
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
