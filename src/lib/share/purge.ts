import { db } from "@/lib/db";

/**
 * P1-27: expired share links are already refused when opened; this removes
 * their rows, so a link's existence does not outlive its lifetime. Run daily
 * by the worker.
 */
export async function purgeExpiredShares(now: Date = new Date()): Promise<number> {
  const { count } = await db.sharedSnapshot.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}
