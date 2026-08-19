import { db } from "@/lib/db";

async function main(): Promise<void> {
  const bid = process.argv[2];
  if (!bid) throw new Error("usage: _probe.ts <batchId>");
  const b = await db.batchRun.findUnique({
    where: { id: bid },
    select: { status: true, spentUsd: true, halted: true, completedAt: true, digest: true },
  });
  const ss = await db.agentSession.findMany({
    where: { batchId: bid },
    select: { chapterNumber: true, status: true, actualCostUsd: true, startedAt: true, completedAt: true, _count: { select: { turns: true } } },
    orderBy: { chapterNumber: "asc" },
  });
  console.log(
    `BATCH status=${b?.status} spent=${b?.spentUsd} halted=${b?.halted} completedAt=${b?.completedAt ? new Date(b.completedAt).toISOString() : null} digest=${b?.digest ? "present" : "null"}`
  );
  for (const s of ss) {
    console.log(
      `  ch${s.chapterNumber} status=${s.status} cost=${s.actualCostUsd} turns=${s._count.turns} started=${s.startedAt ? new Date(s.startedAt).toISOString() : null} completed=${s.completedAt ? new Date(s.completedAt).toISOString() : null}`
    );
  }
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
