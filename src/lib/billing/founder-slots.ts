import { db } from "@/lib/db";
import { PLANS } from "./stripe-client";

/**
 * Founder slots: at most FOUNDER_SLOT_CAP writers, one slot each, forever.
 *
 * Checkout's count is only an early "sold out" answer: it reserves nothing,
 * and any number of sessions can be open at 199. The cap is enforced HERE,
 * when a completed purchase takes its slot. Every claimer takes the same
 * Postgres advisory lock inside its transaction, so the count it reads is
 * still the count when it inserts; the lock is released at commit.
 */
export const FOUNDER_SLOT_CAP: number = PLANS.founder.maxSlots;

const FOUNDER_SLOT_LOCK = "wmb-founder-slots";

export type FounderSlotClaim = "claimed" | "already_claimed" | "full";

export async function claimFounderSlot(userId: string): Promise<FounderSlotClaim> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${FOUNDER_SLOT_LOCK}))`;

    // A redelivered event, or a writer who kept their slot (slots survive
    // cancellation), already holds one: the purchase stands, no second slot.
    const existing = await tx.founderSlot.findUnique({ where: { userId } });
    if (existing) return "already_claimed";

    const claimed = await tx.founderSlot.count();
    if (claimed >= FOUNDER_SLOT_CAP) return "full";

    await tx.founderSlot.create({ data: { userId } });
    return "claimed";
  });
}

/** Slots still open, never below zero (rows from before the cap held can exceed it). */
export function founderSlotsAvailable(claimed: number): number {
  return Math.max(0, FOUNDER_SLOT_CAP - claimed);
}
