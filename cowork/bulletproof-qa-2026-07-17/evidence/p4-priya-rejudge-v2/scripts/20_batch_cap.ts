/**
 * P4 v2 — D-98 LIVE CONFIRM: a HALTED batch is notified honestly.
 *
 * Kicks a batch with a deliberately tiny aggregate cap ($0.002) over the same 3
 * chapters. The first child to COMPLETE crosses the cap -> onComplete trips the
 * Redis halt flag -> the pre-child guard marks the remaining child 'skipped'
 * (never spends). Digest then finalizes status="halted", haltReason="budget_cap".
 *
 * CONFIRM (v1 baseline in parens):
 *   - notification TITLE now names the halt: "Overnight batch halted — budget cap
 *     reached"   (was "Overnight batch complete")
 *   - message contains a halt clause "· halted at budget cap"   (was silent)
 *   - the cap renders with precision "$0.002 cap"   (was "$0.00 cap")
 *   - skipped children never spent; the surfaced spend is still honest.
 *
 * Also captures the MID-RUN live halt surface (batch.halted flips true from the
 * Redis flag before the digest persists it).
 */
import { readFileSync } from "node:fs";
import { api, dump, sleep, STATE_FILE } from "./_client";
import { db } from "@/lib/db";

const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);
const POLL_MS = 1500;
const MAX_MS = 540_000;

async function main(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { bookId: string };
  const bookId = state.bookId;
  const CAP = 0.002;
  console.log(`=== P4 v2 Gate-4 tiny-cap halt ($${CAP}) — book ${bookId} ===`);

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
  let midrunHaltedSaved = false;

  while (Date.now() - t0 < MAX_MS) {
    const s = await api<{
      batch: { status: string; spentUsd: number; halted: boolean; haltReason: string | null; budgetCapUsd: number };
      counts: Record<string, number>;
    }>("GET", `/api/books/${bookId}/batch/${batchId}`);
    last = s;
    const b = s.json?.batch;
    const terminal = !!(b && TERMINAL.has(b.status));
    transitions.push({
      t_s: +((Date.now() - t0) / 1000).toFixed(2),
      wallClockUtc: s.wallClockUtc,
      status: b?.status,
      halted: b?.halted,
      haltReason: b?.haltReason,
      counts: s.json?.counts,
      spentUsd: b?.spentUsd,
      terminal,
    });
    console.log(
      `  poll t+${((Date.now() - t0) / 1000).toFixed(1)}s status=${b?.status} halted=${b?.halted} running=${s.json?.counts?.running} spent=${b?.spentUsd}`
    );
    if (!midrunHaltedSaved && !terminal && b?.halted === true) {
      dump("21_midrun_halted_true", s);
      midrunHaltedSaved = true;
    }
    if (terminal) break;
    await sleep(POLL_MS);
  }
  dump("21_batch_cap_transitions", transitions);
  dump("22_batch_cap_terminal", last);

  const sessions = await db.agentSession.findMany({
    where: { batchId },
    select: { chapterNumber: true, status: true, actualCostUsd: true },
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

  const note = notes[0];
  const analysis = {
    batchId,
    cap: CAP,
    per_session: sessions,
    skipped_count: skipped.length,
    skipped_never_spent: skipped.every((s) => Number(s.actualCostUsd ?? 0) === 0),
    db_actualCostUsd_sum: dbSpent,
    notification_title: note?.title ?? null,
    notification_message: note?.message ?? null,
    notification_priority: note?.priority ?? null,
    d98_checks: {
      title_names_halt: /halted/i.test(note?.title ?? ""),
      title_names_budget_cap: /budget cap/i.test(note?.title ?? ""),
      message_has_halt_clause: /halted at budget cap/i.test(note?.message ?? ""),
      cap_renders_with_precision:
        /\$0\.002\s*cap/.test(note?.message ?? "") && !/\$0\.00\s*cap/.test(note?.message ?? ""),
    },
    all_notifications: notes,
  };
  dump("23_batch_cap_analysis", analysis);

  console.log("\n=== D-98 HALTED NOTIFICATION ===");
  console.log(`  title   = ${analysis.notification_title}`);
  console.log(`  message = ${analysis.notification_message}`);
  console.log(`  checks  = ${JSON.stringify(analysis.d98_checks)}`);
  console.log(`  sessions: ${JSON.stringify(sessions.map((s) => ({ ch: s.chapterNumber, status: s.status, cost: s.actualCostUsd })))}`);
  console.log(`  skipped=${skipped.length} skipped-never-spent=${analysis.skipped_never_spent}`);

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
