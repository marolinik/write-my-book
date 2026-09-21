/**
 * D4 — the managed no-key tier.
 *
 * A cold Free writer has zero working AI until they paste a provider key. Two
 * separate reviews named that the biggest single lever on the free-tier
 * ceiling, and it is the last item in the 2026-08-31 founder-call list.
 *
 * It is also the only item in that list that spends the owner's money, and
 * `client-factory.ts` opens with a deliberate invariant:
 *
 *   "No key -> explicit error (never silently falls back to platform keys)"
 *
 * This module does not break that invariant. It names the exception. The
 * fallback is explicit (a caller asks for it by name), metered (two caps),
 * disclosed (usage rows carry `keySource: "platform"`, which the spend panel
 * already separates), and it does not exist at all until the owner sets two
 * environment variables. A key alone does nothing; a flag alone does nothing.
 *
 * Nothing in this file has ever run against a real platform key: none exists
 * in the development environment. It is inert by construction until the owner
 * turns it on, and the first run on a real key should be watched.
 */
import { ALL_USAGE_INCLUDING_DISCARDED } from "./billed-usage";

/** Providers the product can actually route a platform key through. */
const ROUTABLE_PROVIDERS = ["anthropic", "openrouter", "openai", "gemini", "grok"] as const;

export type ManagedProvider = (typeof ROUTABLE_PROVIDERS)[number];

/**
 * What the product is willing to spend per writer on its own key.
 *
 * These are the owner's money, so they live in one place and are deliberately
 * small: enough for a cold writer to see the product work on their own
 * manuscript, not enough for anyone to run a book through it for free.
 */
export const MANAGED_TIER = {
  /** Per writer, per UTC day. */
  dailyCostCapUsd: 0.5,
  /** Per writer, per UTC calendar month. */
  monthlyCostCapUsd: 3,
} as const;

export interface ManagedTierConfig {
  provider: ManagedProvider;
  apiKey: string;
}

/**
 * The platform key, or null when the owner has not turned this on.
 *
 * Two switches, both required, because a key that leaks into an environment
 * must not by itself start spending, and a flag flipped during a config sweep
 * must not by itself start spending either.
 *
 * @param env  process environment; injectable so the contract can prove each
 *             half of the switch on its own.
 */
export function managedTierConfig(
  env: Record<string, string | undefined> = process.env
): ManagedTierConfig | null {
  if (env.MANAGED_TIER_ENABLED !== "1") return null;

  const apiKey = env.WMB_MANAGED_KEY?.trim();
  const provider = env.WMB_MANAGED_KEY_PROVIDER?.trim();
  if (!apiKey || !provider) return null;
  if (!(ROUTABLE_PROVIDERS as readonly string[]).includes(provider)) return null;

  return { provider: provider as ManagedProvider, apiKey };
}

export type ManagedRefusal = "disabled" | "not-free" | "daily-cap" | "monthly-cap";

export interface ManagedAllowance {
  granted: boolean;
  reason?: ManagedRefusal;
  /** What is left today, for the disclosure the writer reads. */
  remainingTodayUsd: number;
  remainingThisMonthUsd: number;
}

export interface ManagedAllowanceInput {
  config: ManagedTierConfig | null;
  isFree: boolean;
  /**
   * Platform spend already recorded for this writer. This counts rows the
   * writer was NOT billed for as well (D3): a generation the product threw
   * away still cost the owner real money when it ran on the owner's key. The
   * writer is not charged for it; the cap absolutely still is.
   */
  spentTodayUsd: number;
  spentThisMonthUsd: number;
}

/** Whether this writer may run on the product's key right now, and what is left. */
export function managedAllowance(input: ManagedAllowanceInput): ManagedAllowance {
  const remainingTodayUsd = Math.max(0, MANAGED_TIER.dailyCostCapUsd - input.spentTodayUsd);
  const remainingThisMonthUsd = Math.max(
    0,
    MANAGED_TIER.monthlyCostCapUsd - input.spentThisMonthUsd
  );
  const remainders = { remainingTodayUsd, remainingThisMonthUsd };

  if (!input.config) return { granted: false, reason: "disabled", ...remainders };
  if (!input.isFree) return { granted: false, reason: "not-free", ...remainders };
  if (remainingThisMonthUsd <= 0) return { granted: false, reason: "monthly-cap", ...remainders };
  if (remainingTodayUsd <= 0) return { granted: false, reason: "daily-cap", ...remainders };

  return { granted: true, ...remainders };
}

/**
 * What this writer has already spent on the product's key.
 *
 * Deliberately NOT filtered by `BILLED_ONLY`: a discarded generation (D3) was
 * free for the writer and real money for the owner, so the cap has to see it.
 */
export async function managedSpend(
  userId: string
): Promise<{ today: number; month: number }> {
  const { db } = await import("@/lib/db");
  const now = new Date();
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [day, month] = await Promise.all([
    db.usageRecord.aggregate({
      where: {
        userId,
        keySource: "platform",
        recordedAt: { gte: startOfDay },
        ...ALL_USAGE_INCLUDING_DISCARDED,
      },
      _sum: { costEstimate: true },
    }),
    db.usageRecord.aggregate({
      where: {
        userId,
        keySource: "platform",
        recordedAt: { gte: startOfMonth },
        ...ALL_USAGE_INCLUDING_DISCARDED,
      },
      _sum: { costEstimate: true },
    }),
  ]);

  return {
    today: day._sum.costEstimate ?? 0,
    month: month._sum.costEstimate ?? 0,
  };
}

/**
 * The whole decision for one writer: may they run on the product's key, and
 * with what left. Returns the key itself only when the answer is yes, so a
 * caller cannot hold a platform key it was not granted.
 */
export async function managedKeyFor(
  userId: string,
  isFree: boolean
): Promise<{ allowance: ManagedAllowance; config: ManagedTierConfig | null }> {
  const config = managedTierConfig();
  if (!config) {
    return {
      allowance: managedAllowance({ config: null, isFree, spentTodayUsd: 0, spentThisMonthUsd: 0 }),
      config: null,
    };
  }

  const spend = await managedSpend(userId);
  const allowance = managedAllowance({
    config,
    isFree,
    spentTodayUsd: spend.today,
    spentThisMonthUsd: spend.month,
  });
  return { allowance, config: allowance.granted ? config : null };
}
