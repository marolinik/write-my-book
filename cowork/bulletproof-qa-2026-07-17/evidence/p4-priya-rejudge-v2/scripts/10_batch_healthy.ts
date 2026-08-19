/**
 * P4 v2 — D-96 LIVE CONFIRM: the batch poll surface is now honest MID-RUN.
 *
 * Kicks a small REAL batch (dev-edit x 3 chapters, cap $10, real qwen3.6 via BYOK)
 * and polls GET /api/books/{id}/batch/{batchId} RAPIDLY (~1.5s) THROUGHOUT the run
 * — not just at terminal. Captures the live transition and proves, mid-run:
 *   (a) counts.running > 0 while a child is actually executing   (was always 0)
 *   (b) batch.status === "running"                               (was stuck "queued")
 *   (c) batch.spentUsd > 0 after a child completed+billed mid-run (was $0 until terminal)
 *   (d) batch.startedAt is set                                    (was null until terminal)
 *
 * Then confirms the TERMINAL poll is still exact truth and the FOUR-WAY spend
 * agreement still holds (BatchRun.spentUsd = digest.spentUsd = DB actualCostUsd
 * sum = notification message) — the D-96 live-view fix must NOT regress terminal
 * money truth.
 *
 * Notification text is not exposed over HTTP, so the persisted BookNotification
 * row is read directly via the app's Prisma client (read-only; the exact row the
 * dashboard renders).
 */
import { readFileSync } from "node:fs";
import { api, dump, sleep, STATE_FILE } from "./_client";
import { db } from "@/lib/db";

const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);
const POLL_MS = 1500;
const MAX_MS = 480_000;

interface BatchBody {
  batch: {
    id: string;
    status: string;
    spentUsd: number;
    budgetCapUsd: number;
    halted: boolean;
    haltReason: string | null;
    childCount: number;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    digest: {
      spentUsd?: number;
      passes?: { total: number; completed: number; failed: number; skipped: number };
      findings?: { total: number };
    } | null;
  };
  counts: Record<string, number>;
}

async function main(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { bookId: string };
  const bookId = state.bookId;
  console.log(`=== P4 v2 healthy batch (D-96 mid-run live) — book ${bookId} ===`);

  const kick = await api<{ batchId: string; childCount: number; scheduledFor: string | null }>(
    "POST",
    `/api/books/${bookId}/batch`,
    { workflowIds: ["dev-edit"], chapterStart: 1, chapterEnd: 3, budgetCapUsd: 10, scheduleMode: "now" }
  );
  dump("10_batch_healthy_create", kick);
  const batchId = kick.json?.batchId;
  console.log(`POST batch -> ${kick.status} batchId=${batchId} childCount=${kick.json?.childCount}`);
  if (!batchId) throw new Error("batch create failed");

  const t0 = Date.now();
  const timeline: Array<Record<string, unknown>> = [];
  let last: Awaited<ReturnType<typeof api<BatchBody>>> | null = null;

  // Proving-poll captures (first mid-run poll that demonstrates each claim).
  let firstRunningSaved = false; // (a) counts.running > 0
  let firstStatusRunningSaved = false; // (b) batch.status === "running"
  let firstMidrunSpendSaved = false; // (c) non-terminal poll with spentUsd > 0
  let firstStartedAtSaved = false; // (d) startedAt set while non-terminal

  while (Date.now() - t0 < MAX_MS) {
    const s = await api<BatchBody>("GET", `/api/books/${bookId}/batch/${batchId}`);
    last = s;
    const b = s.json?.batch;
    const c = s.json?.counts;
    const terminal = !!(b && TERMINAL.has(b.status));
    const snap = {
      t_s: +((Date.now() - t0) / 1000).toFixed(2),
      wallClockUtc: s.wallClockUtc,
      status: b?.status,
      counts: c,
      spentUsd: b?.spentUsd,
      halted: b?.halted,
      startedAt: b?.startedAt ?? null,
      terminal,
    };
    timeline.push(snap);
    console.log(
      `  poll t+${snap.t_s}s status=${b?.status} running=${c?.running} completed=${c?.completed} spent=${b?.spentUsd} startedAt=${b?.startedAt ?? "null"}`
    );

    // ── Capture proving polls MID-RUN (non-terminal only for the money/started claims) ──
    if (!firstRunningSaved && (c?.running ?? 0) > 0) {
      dump("11_midrun_running_gt0", s);
      firstRunningSaved = true;
    }
    if (!firstStatusRunningSaved && b?.status === "running") {
      dump("11_midrun_status_running", s);
      firstStatusRunningSaved = true;
    }
    if (!firstMidrunSpendSaved && !terminal && Number(b?.spentUsd ?? 0) > 0) {
      dump("12_midrun_spent_gt0", s);
      firstMidrunSpendSaved = true;
    }
    if (!firstStartedAtSaved && !terminal && b?.startedAt) {
      dump("12_midrun_startedAt_set", s);
      firstStartedAtSaved = true;
    }

    if (terminal) break;
    await sleep(POLL_MS);
  }

  dump("13_healthy_timeline", { batchId, pollIntervalMs: POLL_MS, polls: timeline });
  dump("14_batch_healthy_terminal", last);

  const b = last?.json?.batch;
  if (!b) throw new Error("no terminal batch body");

  // ── Read the persisted notification the writer actually sees (dashboard query) ──
  const bookRow = await db.book.findUnique({ where: { id: bookId }, select: { userId: true } });
  const notes = await db.bookNotification.findMany({
    where: { userId: bookRow?.userId, bookId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, title: true, message: true, priority: true, createdAt: true },
  });
  dump("15_notifications_persisted", notes);

  // ── DB-side actualCostUsd sum (independent of Redis ledger) ──
  const sessions = await db.agentSession.findMany({
    where: { batchId },
    select: { id: true, status: true, chapterNumber: true, actualCostUsd: true },
    orderBy: { chapterNumber: "asc" },
  });
  const dbSpent = sessions.reduce((s, x) => s + Number(x.actualCostUsd ?? 0), 0);

  const completeNote = notes.find((n) => n.type === "pipeline_complete");
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
    fourway_agreement: {
      all_present: [b.spentUsd, b.digest?.spentUsd, dbSpent, notifSpend].every((v) => v != null),
      nonzero: Number(b.spentUsd) > 0,
      batchRun_eq_digest: Math.abs(Number(b.spentUsd) - Number(b.digest?.spentUsd ?? -1)) < 1e-9,
      db_eq_batchRun_exact: Math.abs(dbSpent - Number(b.spentUsd)) < 1e-9,
      notif_eq_batchRun_2dp:
        notifSpend != null && notifSpend.toFixed(2) === Number(b.spentUsd).toFixed(2),
    },
    halted: b.halted,
    haltReason: b.haltReason,
    passes: b.digest?.passes ?? null,
    findings_total: b.digest?.findings?.total ?? null,
    startedAt_terminal: b.startedAt,
    // Mid-run honesty summary derived from the timeline (proof of D-96 a/b/c/d).
    midrun_observed: {
      saw_running_gt0: timeline.some((p) => Number((p.counts as Record<string, number>)?.running ?? 0) > 0),
      saw_status_running: timeline.some((p) => p.status === "running"),
      saw_nonterminal_spend_gt0: timeline.some(
        (p) => p.terminal === false && Number(p.spentUsd ?? 0) > 0
      ),
      saw_nonterminal_startedAt: timeline.some((p) => p.terminal === false && p.startedAt != null),
    },
  };
  dump("16_fourway_spend_agreement", analysis);

  console.log("\n=== FOUR-WAY SPEND AGREEMENT (terminal) ===");
  console.log(`  BatchRun.spentUsd    = ${analysis.batchRun_spentUsd}`);
  console.log(`  digest.spentUsd      = ${analysis.digest_spentUsd}`);
  console.log(`  DB actualCostUsd sum = ${analysis.db_actualCostUsd_sum}`);
  console.log(`  notification message = ${analysis.notification_message}`);
  console.log(`  notification parsed  = ${analysis.notification_parsed_spend}`);
  console.log(`  agreement = ${JSON.stringify(analysis.fourway_agreement)}`);
  console.log(`  midrun_observed = ${JSON.stringify(analysis.midrun_observed)}`);

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
