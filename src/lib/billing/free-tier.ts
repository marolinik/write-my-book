/**
 * FREE tier — the card-free, key-free on-ramp.
 *
 * "Free" is a DERIVED state, never a stored plan value and never a Stripe
 * object. A user is Free when they have no Subscription row, or the row's
 * status is "none"/"canceled", or a trial has expired. Every gate imports
 * `isFreeTier` as the single source of truth for that determination.
 *
 * All Free limits live in the ONE `FREE_TIER` const below — no hardcoding at
 * gate sites. These are soft business caps tunable post-launch from conversion
 * data; the stored plan stays `"none"` (plan-gate hierarchy depends on it).
 *
 * Pure module: no `db` import so the derivation + date helpers stay trivially
 * unit-testable. DB-backed counters live in `./free-tier-meters`.
 */

export const FREE_TIER = {
  name: "Free",
  /** Books a Free writer may own (counts ALL rows incl. archived). */
  maxBooks: 1,
  /** Agent sessions per UTC calendar month (counted from AgentSession rows). */
  monthlyAgentSessions: 20,
  /** Ghost-text completions per UTC day (FreeTierUsage counter). */
  dailyGhostText: 100,
  /** Inline edits per UTC day (FreeTierUsage counter). */
  dailyInlineEdit: 50,
  /** AI-eligible words across owned books (sum of Book.wordCount). */
  maxAiEligibleWords: 40_000,
  /** Concurrent running agent sessions. */
  maxConcurrentSessions: 1,
} as const;

/** Minimal structural shape of a Subscription needed to derive Free state. */
export interface FreeTierSubscriptionShape {
  status: string;
  trialEnd: Date | null;
}

/**
 * THE single downgrade rule. A user is on Free when:
 *  - there is no Subscription row, OR
 *  - status is "none" or "canceled", OR
 *  - status is "trialing" but the trial has already ended.
 *
 * A `trialing` sub with a live (future) trialEnd is PAID, not Free.
 */
export function isFreeTier(
  sub: FreeTierSubscriptionShape | null | undefined
): boolean {
  if (!sub) return true;
  if (sub.status === "none" || sub.status === "canceled") return true;
  if (sub.status === "trialing" && !!sub.trialEnd && sub.trialEnd < new Date()) {
    return true;
  }
  return false;
}

/**
 * Rollback lever. Set `FREE_TIER_DISABLED=1` to make gates behave exactly as
 * they did before the Free tier shipped (inactive subscriptions are read-only).
 */
export function isFreeTierEnabled(): boolean {
  return process.env.FREE_TIER_DISABLED !== "1";
}

/** Start of the current UTC calendar month (00:00:00 on the 1st, UTC). */
export function utcMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** UTC day key, e.g. "2026-07-19". Stable across the process's timezone. */
export function utcDayKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
