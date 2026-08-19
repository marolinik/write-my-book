/**
 * Central gate for PLATFORM-PAID prose indexing (the only per-free-user
 * platform-LLM spend: OpenAI embeddings on process.env.OPENAI_API_KEY).
 *
 * Free writers get their first FREE_TIER.maxAiEligibleWords indexed, then
 * indexing PAUSES (moat stays demo-able; worst-case spend ≈ $0.0008/user).
 * Paid users are never capped. QUERY/search embeddings stay UNGATED — they
 * are per-query and effectively free, and the moat must stay demo-able.
 *
 * When this returns false, callers MUST skip indexing AND surface the state
 * honestly wherever memory status renders — never a silent degradation
 * (D-35 / D-36 lesson).
 */

import { db } from "@/lib/db";
import { FREE_TIER } from "@/lib/billing/free-tier";
import { sumOwnedWordCount, isFreeTierUser } from "@/lib/billing/free-tier-meters";
import { isEmbeddingAvailable } from "./embeddings";

/**
 * Whether prose written by `userId` may be indexed into vector memory right
 * now. False when embeddings are unavailable, or when a Free user has passed
 * the AI-eligible word cap.
 */
export async function canIndexProseForUser(userId: string): Promise<boolean> {
  if (!isEmbeddingAvailable()) return false;

  const sub = await db.subscription.findUnique({ where: { userId } });
  if (!isFreeTierUser(sub)) return true;

  const words = await sumOwnedWordCount(userId);
  return words <= FREE_TIER.maxAiEligibleWords;
}
