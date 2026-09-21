/**
 * D3 — the generation the writer paid for and never received.
 *
 * The discuss route is scrupulous about the turn: when a settle races the cap,
 * or the writer cancels mid-wait, nothing is persisted, nothing is consumed,
 * the thread stays virgin. Its own comment names what is left over: the
 * provider was paid for the generation either way.
 *
 * So the writer's provider bill carries a charge the product had no record of.
 * Saying nothing is defensible only until they compare the two numbers, and
 * then the product looks like it is hiding something it merely never wrote
 * down.
 *
 * A discarded generation is now recorded like any other run — same table, same
 * cost, same model — and marked `billed: false`. Every place that totals what
 * the writer spent reads billed rows only, so nothing they are charged for
 * changes; one disclosure line adds up the rest.
 */

import { db } from "@/lib/db";

/**
 * The `where` fragment every reader of spend must carry.
 *
 * It exists as one exported constant rather than a repeated literal because
 * the place that forgets it is the place that silently charges the writer for
 * work they never saw. `discarded-generation-disclosure.test.ts` walks every
 * source file and fails on a usage read that does not carry it.
 */
export const BILLED_ONLY = { billed: true } as const;

/** Whether a usage row counts towards what the writer was charged. */
export function isBilledUsage(row: { billed: boolean }): boolean {
  return row.billed;
}

/**
 * Flip a row the writer was charged for to unbilled, because the product threw
 * the generation away after the provider had already produced it.
 *
 * The usage row is written the moment the provider returns usable text, which
 * is before the caller can know whether the settle raced the cap or the writer
 * walked away. This is that correction, and it never throws: a failed
 * disclosure must not turn a handled cap-race into a 500.
 */
export async function markGenerationDiscarded(usageRecordId: string): Promise<void> {
  try {
    await db.usageRecord.update({
      where: { id: usageRecordId },
      data: { billed: false },
    });
  } catch (error) {
    console.error(
      "[Usage] Could not mark a generation discarded (non-fatal):",
      error instanceof Error ? error.message : error
    );
  }
}

export interface DiscardedGeneration {
  userId: string;
  bookId: string;
  agentType: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costEstimate: number;
  keySource?: string;
}

/**
 * Record a generation the provider produced and the product threw away.
 *
 * Never throws: a failure to write the disclosure must not turn a handled
 * cap-race into a 500 for the writer. It is logged instead, which is the same
 * bargain the blackboard promotion and the graph update already make.
 */
export async function recordDiscardedGeneration(
  generation: DiscardedGeneration
): Promise<void> {
  try {
    await db.usageRecord.create({
      data: {
        userId: generation.userId,
        bookId: generation.bookId,
        agentType: generation.agentType,
        model: generation.model,
        tokensInput: generation.tokensInput,
        tokensOutput: generation.tokensOutput,
        costEstimate: generation.costEstimate,
        keySource: generation.keySource ?? "user",
        billed: false,
      },
    });
  } catch (error) {
    console.error(
      "[Usage] Could not record a discarded generation (non-fatal):",
      error instanceof Error ? error.message : error
    );
  }
}

/** What the writer's provider charged for work the product never delivered. */
export async function discardedTotals(
  userId: string,
  bookId?: string
): Promise<{ count: number; costUsd: number }> {
  const result = await db.usageRecord.aggregate({
    where: { userId, billed: false, ...(bookId ? { bookId } : {}) },
    _count: { _all: true },
    _sum: { costEstimate: true },
  });
  return {
    count: result._count._all,
    costUsd: result._sum.costEstimate ?? 0,
  };
}
