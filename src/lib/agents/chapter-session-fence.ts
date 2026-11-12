import { db } from "@/lib/db";

/**
 * P2-19: one agent session at a time per chapter, for every plan. Two
 * sessions writing one chapter used to last-write-win, and the second tab
 * could not see the first's run. Rows older than the stale window (a crashed
 * worker's leftovers) do not block.
 */
const STALE_RUNNING_SESSION_MS = 2 * 60 * 60 * 1000;

export async function findRunningChapterSession(
  bookId: string,
  chapterNumber: number
): Promise<{ id: string } | null> {
  const row = await db.agentSession.findFirst({
    where: {
      bookId,
      chapterNumber,
      status: "running",
      startedAt: { gte: new Date(Date.now() - STALE_RUNNING_SESSION_MS) },
    },
    select: { id: true },
  });
  return row ?? null;
}
