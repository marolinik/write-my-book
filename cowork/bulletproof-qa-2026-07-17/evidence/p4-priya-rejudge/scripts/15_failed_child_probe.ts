/**
 * Probe the failed batch child (ch3, $0 spend) for any recorded failure detail.
 * Read-only. Helps classify: transient provider failure vs a real defect.
 */
import { dump } from "./_client";
import { db } from "@/lib/db";

const FAILED_SESSION = "e4476f94-d194-48bb-be97-e84fffa9525f";

async function main(): Promise<void> {
  const session = await db.agentSession.findUnique({ where: { id: FAILED_SESSION } });
  const turns = await db.conversationTurn.findMany({
    where: { sessionId: FAILED_SESSION },
    orderBy: { turnIndex: "asc" },
  });
  const usage = await db.usageRecord.findMany({
    where: { userId: session?.userId, bookId: session?.bookId },
    orderBy: { recordedAt: "desc" },
    take: 6,
  });
  // Truncate turn content to keep the trace readable.
  const turnsTrim = turns.map((t) => ({
    turnIndex: t.turnIndex,
    role: t.role,
    contentPreview: t.content.slice(0, 1200),
    contentLen: t.content.length,
  }));
  dump("15_failed_child_probe", {
    failedSession: session,
    turnCount: turns.length,
    turns: turnsTrim,
    recentUsageRecords: usage,
  });
  console.log(`failed session status=${session?.status} cost=${session?.actualCostUsd} turns=${turns.length}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL", e instanceof Error ? e.message : e);
  try {
    await db.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
