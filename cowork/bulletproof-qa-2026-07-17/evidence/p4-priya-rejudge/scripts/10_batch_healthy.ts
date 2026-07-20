/**
 * P4 healthy overnight/batch run (D-17 live confirmation).
 *
 * Kicks a small real batch (dev-edit × 3 chapters, cap $10) with Redis healthy,
 * lets the worker fan-in the digest, then proves the "Overnight batch complete"
 * notification spend figure AGREES with the persisted BatchRun.spentUsd, the
 * digest JSON, and the DB-side actualCostUsd sum — all non-zero, all honest.
 *
 * The notification text is NOT exposed over HTTP (no notifications API route),
 * so we read the persisted BookNotification row directly via the app's Prisma
 * client — the exact row the dashboard renders (read-only; no writes).
 */
import { readFileSync } from "node:fs";
import { api, dump, sleep, STATE_FILE } from "./_client";
import { db } from "@/lib/db";

const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);

interface BatchBody {
  batch: {
    id: string;
    status: string;
    spentUsd: number;
    budgetCapUsd: number;
    halted: boolean;
    haltReason: string | null;
    completedCount: number;
    failedCount: number;
    childCount: number;
    digest: {
      spentUsd?: number;
      passes?: { total: number; completed: number; failed: number; skipped: number };
      findings?: { total: number };
    } | null;
    createdAt: string;
    completedAt: string | null;
  };
  counts: Record<string, number>;
}

async function main(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { bookId: string };
  const bookId = state.bookId;
  console.log(`=== P4 healthy batch (D-17 live) — book ${bookId} ===`);

  const kick = await api<{ batchId: string; childCount: number; scheduledFor: string | null }>(
    "POST",
    `/api/books/${bookId}/batch`,
    { workflowIds: ["dev-edit"], chapterStart: 1, chapterEnd: 3, budgetCapUsd: 10, scheduleMode: "now" }
  );
  dump("10_batch_healthy_create", kick);
  const batchId = kick.json?.batchId;
  console.log(`POST batch -> ${kick.status} batchId=${batchId} childCount=${kick.json?.childCount}`);
  if (!batchId) throw new Error("batch create failed");

  // ── Poll to terminal (label: dev-server; worker concurrency=2) ──
  const t0 = Date.now();
  let last: Awaited<ReturnType<typeof api<BatchBody>>> | null = null;
  const transitions: Array<Record<string, unknown>> = [];
  while (Date.now() - t0 < 360_000) {
    const s = await api<BatchBody>("GET", `/api/books/${bookId}/batch/${batchId}`);
    last = s;
    const b = s.json?.batch;
    const snap = {
      t: Math.round((Date.now() - t0) / 1000),
      status: b?.status,
      counts: s.json?.counts,
      spentUsd: b?.spentUsd,
    };
    transitions.push(snap);
    console.log(`  poll t+${snap.t}s status=${b?.status} counts=${JSON.stringify(s.json?.counts)} spent=${b?.spentUsd}`);
    if (b && TERMINAL.has(b.status)) break;
    await sleep(6000);
  }
  dump("11_batch_healthy_transitions", transitions);
  dump("11_batch_healthy_terminal", last);

  const b = last?.json?.batch;
  if (!b) throw new Error("no terminal batch body");

  // ── Read the persisted notification the writer actually sees (dashboard query) ──
  const notes = await db.bookNotification.findMany({
    where: { userId: (await db.book.findUnique({ where: { id: bookId }, select: { userId: true } }))?.userId, bookId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, title: true, message: true, priority: true, createdAt: true, read: true, dismissedAt: true },
  });
  dump("12_notifications_persisted", notes);

  // ── DB-side actualCostUsd sum (independent of Redis ledger) ──
  const sessions = await db.agentSession.findMany({
    where: { batchId },
    select: { id: true, status: true, chapterNumber: true, actualCostUsd: true },
  });
  const dbSpent = sessions.reduce((s, x) => s + Number(x.actualCostUsd ?? 0), 0);

  const completeNote = notes.find((n) => n.title === "Overnight batch complete");
  // Parse the "$X.XX / $CAP cap" spend figure out of the message.
  const m = completeNote?.message.match(/\$([0-9]+(?:\.[0-9]+)?)\s*\/\s*\$([0-9]+(?:\.[0-9]+)?)\s*cap/);
  const notifSpend = m ? Number(m[1]) : null;

  const analysis = {
    batchId,
    batchRun_spentUsd: b.spentUsd,
    digest_spentUsd: b.digest?.spentUsd ?? null,
    db_actualCostUsd_sum: dbSpent,
    notification_title: completeNote?.title ?? null,
    notification_message: completeNote?.message ?? null,
    notification_parsed_spend: notifSpend,
    per_session: sessions,
    agreement: {
      all_present: [b.spentUsd, b.digest?.spentUsd, dbSpent, notifSpend].every((v) => v != null),
      nonzero: Number(b.spentUsd) > 0,
      batchRun_eq_digest: Math.abs(Number(b.spentUsd) - Number(b.digest?.spentUsd ?? -1)) < 1e-9,
      // notification rounds to 2dp; compare rounded
      notif_eq_batchRun_2dp:
        notifSpend != null && notifSpend.toFixed(2) === Number(b.spentUsd).toFixed(2),
      db_eq_batchRun_2dp: dbSpent.toFixed(2) === Number(b.spentUsd).toFixed(2),
    },
    halted: b.halted,
    haltReason: b.haltReason,
    passes: b.digest?.passes ?? null,
    findings_total: b.digest?.findings?.total ?? null,
    wall_clock_s: b.completedAt
      ? Math.round((new Date(b.completedAt).getTime() - new Date(b.createdAt).getTime()) / 1000)
      : null,
    latency_note: "dev-server (localhost:3002); worker concurrency=2; timing NOT isolation-guaranteed",
  };
  dump("13_threeway_spend_agreement", analysis);

  console.log("\n=== THREE-WAY SPEND AGREEMENT ===");
  console.log(`  BatchRun.spentUsd      = ${analysis.batchRun_spentUsd}`);
  console.log(`  digest.spentUsd        = ${analysis.digest_spentUsd}`);
  console.log(`  DB actualCostUsd sum   = ${analysis.db_actualCostUsd_sum}`);
  console.log(`  notification message   = ${analysis.notification_message}`);
  console.log(`  notification parsed $  = ${analysis.notification_parsed_spend}`);
  console.log(`  agreement = ${JSON.stringify(analysis.agreement)}`);

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
