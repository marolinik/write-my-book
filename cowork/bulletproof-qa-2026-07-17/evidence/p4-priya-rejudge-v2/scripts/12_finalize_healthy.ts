/**
 * Finalize the D-96 healthy batch: it did not terminate within the mid-run
 * capture window (heavy shared-worker contention). Re-poll the SAME batch to
 * terminal via the live HTTP route, then capture the terminal poll + persisted
 * notification + FOUR-WAY spend agreement (BatchRun.spentUsd = digest.spentUsd
 * = DB actualCostUsd sum = notification message). Read-only; no new batch.
 *
 * batchId is read from 10_batch_healthy_create.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { api, dump, sleep, STATE_FILE, TRACE_DIR } from "./_client";
import { db } from "@/lib/db";

const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);
const POLL_MS = 4000;
const MAX_MS = 900_000; // up to 15 min

async function main(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { bookId: string };
  const bookId = state.bookId;
  const create = JSON.parse(
    readFileSync(join(TRACE_DIR, "10_batch_healthy_create.json"), "utf8")
  ) as { json: { batchId: string } };
  const batchId = create.json.batchId;
  console.log(`=== finalize healthy batch ${batchId} (book ${bookId}) ===`);

  const t0 = Date.now();
  let last: Awaited<ReturnType<typeof api>> | null = null;
  while (Date.now() - t0 < MAX_MS) {
    const s = await api<{
      batch: { status: string; spentUsd: number; halted: boolean; digest: unknown };
      counts: Record<string, number>;
    }>("GET", `/api/books/${bookId}/batch/${batchId}`);
    last = s;
    const b = s.json?.batch;
    console.log(
      `  poll t+${((Date.now() - t0) / 1000).toFixed(0)}s status=${b?.status} counts=${JSON.stringify(s.json?.counts)} spent=${b?.spentUsd}`
    );
    if (b && TERMINAL.has(b.status)) break;
    await sleep(POLL_MS);
  }
  dump("17_healthy_terminal_final", last);

  const b = (last?.json as { batch?: Record<string, unknown> } | null)?.batch as
    | {
        status: string;
        spentUsd: number;
        halted: boolean;
        haltReason: string | null;
        startedAt: string | null;
        digest: { spentUsd?: number; passes?: Record<string, number>; findings?: { total: number } } | null;
      }
    | undefined;
  if (!b) throw new Error("no batch body");

  const bookRow = await db.book.findUnique({ where: { id: bookId }, select: { userId: true } });
  const notes = await db.bookNotification.findMany({
    where: { userId: bookRow?.userId, bookId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, title: true, message: true, priority: true, createdAt: true },
  });
  dump("18_notifications_final", notes);

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
    terminal_status: b.status,
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
    passes: b.digest?.passes ?? null,
    findings_total: b.digest?.findings?.total ?? null,
  };
  dump("19_fourway_spend_agreement_final", analysis);

  console.log("\n=== FOUR-WAY SPEND AGREEMENT (terminal, final) ===");
  console.log(`  terminal status     = ${analysis.terminal_status}`);
  console.log(`  BatchRun.spentUsd    = ${analysis.batchRun_spentUsd}`);
  console.log(`  digest.spentUsd      = ${analysis.digest_spentUsd}`);
  console.log(`  DB actualCostUsd sum = ${analysis.db_actualCostUsd_sum}`);
  console.log(`  notification title   = ${analysis.notification_title}`);
  console.log(`  notification message = ${analysis.notification_message}`);
  console.log(`  agreement = ${JSON.stringify(analysis.fourway_agreement)}`);

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
