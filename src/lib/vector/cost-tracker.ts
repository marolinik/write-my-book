/**
 * Embedding cost tracking via UsageRecord.
 * Tracks OpenAI text-embedding-3-small costs per book/user.
 *
 * Cost rate: $0.02 per 1M tokens = $0.00000002 per token
 */

import { db } from "@/lib/db";

export const COST_PER_TOKEN = 0.00000002; // $0.02 / 1,000,000 tokens
const EMBEDDING_MODEL = "text-embedding-3-small";
const AGENT_TYPE = "embedding";

/**
 * Record embedding cost in UsageRecord.
 * Fire-and-forget — callers should not await this.
 */
export async function trackEmbeddingCost(
  userId: string,
  bookId: string,
  tokensUsed: number
): Promise<void> {
  if (tokensUsed <= 0) return;

  try {
    await db.usageRecord.create({
      data: {
        userId,
        bookId,
        agentType: AGENT_TYPE,
        model: EMBEDDING_MODEL,
        tokensInput: tokensUsed,
        tokensOutput: 0,
        costEstimate: tokensUsed * COST_PER_TOKEN,
      },
    });
  } catch (error) {
    // Fire-and-forget: log but don't throw
    console.error("[cost-tracker] Failed to record embedding cost:", error);
  }
}

/**
 * Get total embedding costs for a user, optionally filtered by book.
 */
export async function getEmbeddingCosts(
  userId: string,
  bookId?: string
): Promise<{ totalCost: number; totalTokens: number }> {
  const where: Record<string, unknown> = {
    userId,
    agentType: AGENT_TYPE,
  };

  if (bookId) {
    where.bookId = bookId;
  }

  const result = await db.usageRecord.aggregate({
    where,
    _sum: {
      costEstimate: true,
      tokensInput: true,
    },
  });

  return {
    totalCost: result._sum.costEstimate ?? 0,
    totalTokens: result._sum.tokensInput ?? 0,
  };
}
