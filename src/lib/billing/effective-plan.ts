import { isFreeTier } from "./free-tier";

/**
 * The plan a writer HAS right now, for display.
 *
 * A canceled or lapsed subscription keeps its stored plan "for reference"
 * (the webhook never clears it), so the stored value cannot say which plan is
 * current. This applies the one downgrade rule every gate uses (isFreeTier):
 * while the plan is live it is the stored plan; once it has lapsed the writer
 * is on Free ("none"), whatever plan is stored.
 *
 * Pure and client-safe: import it directly, not through the `@/lib/billing`
 * barrel, which pulls the Stripe server client.
 */
export interface EffectivePlanInput {
  plan?: string | null;
  status?: string | null;
  /** ISO string from the API, or a Date. */
  trialEnd?: string | Date | null;
}

export function effectivePlanKey(sub: EffectivePlanInput | null | undefined): string {
  if (!sub) return "none";
  const trialEnd = sub.trialEnd ? new Date(sub.trialEnd) : null;
  if (isFreeTier({ status: sub.status ?? "none", trialEnd })) return "none";
  return sub.plan ?? "none";
}
