/**
 * Gate-4 LIVE money-cap halt. Kicks a batch with a deliberately tiny aggregate
 * cap ($0.002) over the same 3 chapters. The first child to COMPLETE crosses the
 * cap → onComplete trips `batch:{id}:halted` → the pre-child guard marks every
 * remaining child 'skipped' (never spends). Proves: money halts honestly, the
 * skip-guard fires, and the digest surfaces the halt truthfully.
 *
 * Bounded-overshoot note (BATCH-SPEC §4.5): the ledger commits on completion and
 * the gate is checked at dispatch, so children already admitted before the halt
 * still run — a bounded overshoot of at most one per-child cost, NOT a runaway.
 */
import { readFileSync } from "node:fs";
import { api, dump, sleep, STATE_FILE } from "./_client";
import { db } from "@/lib/db";

const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);

async function main(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { bookId: string };
  const bookId = state.bookId;
  const CAP = 0.002;
  console.log(`=== Gate-4 tiny-cap halt ($${CAP}) — book ${bookId} ===`);

  const kick = await api<{ batchId: string; childCount: number }>(
    "POST",
    `/api/books/${bookId}/batch`,
    { workflowIds: ["dev-edit"], chapterStart: 1, chapterEnd: 3, budgetCapUsd: CAP, scheduleMode: "now" }
  );
  dump("20_batch_cap_create", kick);
  const batchId = kick.json?.batchId;
  console.log(`POST batch (cap $${CAP}) -> ${kick.status} batchId=${batchId} childCount=${kick.json?.childCount}`);
  if (!batchId) throw new Error("batch create failed");

  const t0 = Date.now();
  let last: unknown = null;
  const transitions: Array<Record<string, unknown>> = [];
  while (Date.now() - t0 < 360_000) {
    const s = await api<{ batch: { status: string; spentUsd: number; halted: boolean }; counts: Record<string, number> }>(
      "GET",
      `/api/books/${bookId}/batch/${batchId}`
    );
    last = s;
    const b = s.json?.batch;
    transitions.push({ t: Math.round((Date.now() - t0) / 1000), status: b?.status, halted: b?.halted, counts: s.json?.counts, spent: b?.spentUsd });
    console.log(`  poll t+${Math.round((Date.now() - t0) / 1000)}s status=${b?.status} halted=${b?.halted} counts=${JSON.stringify(s.json?.counts)} spent=${b?.spentUsd}`);
    if (b && TERMINAL.has(b.status)) break;
    await sleep(6000);
  }
  dump("21_batch_cap_transitions", transitions);
  dump("21_batch_cap_terminal", last);

  const sessions = await db.agentSession.findMany({
    where: { batchId },
    select: { id: true, status: true, chapterNumber: true, actualCostUsd: true },
    orderBy: { chapterNumber: "asc" },
  });
  const dbSpent = sessions.reduce((s, x) => s + Number(x.actualCostUsd ?? 0), 0);
  const skipped = sessions.filter((s) => s.status === "skipped");
  const notes = await db.bookNotification.findMany({
    where: { bookId, type: "pipeline_complete" },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { title: true, message: true, priority: true, createdAt: true },
  });
  dump("22_batch_cap_analysis", {
    batchId,
    cap: CAP,
    per_session: sessions,
    skipped_count: skipped.length,
    skipped_never_spent: skipped.every((s) => Number(s.actualCostUsd ?? 0) === 0),
    db_actualCostUsd_sum: dbSpent,
    notifications: notes,
  });
  console.log(`\nsessions: ${JSON.stringify(sessions.map((s) => ({ ch: s.chapterNumber, status: s.status, cost: s.actualCostUsd })))}`);
  console.log(`skipped=${skipped.length} skipped-never-spent=${skipped.every((s) => Number(s.actualCostUsd ?? 0) === 0)}`);
  console.log(`notification=${notes[0]?.message ?? "(none)"}`);
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
