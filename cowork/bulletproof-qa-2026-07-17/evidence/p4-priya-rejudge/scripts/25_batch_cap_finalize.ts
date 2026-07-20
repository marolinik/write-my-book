/**
 * Finalize-poll the Gate-4 cap batch until terminal, then capture the honest
 * halt digest + notification. Reads the batchId from 20_batch_cap_create.json.
 * No new spend: the last queued child will be SKIPPED by the guard (Redis halt
 * flag already set), not run.
 */
import { readFileSync } from "node:fs";
import { api, dump, sleep, STATE_FILE, TRACE_DIR } from "./_client";
import { join } from "node:path";
import { db } from "@/lib/db";

const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);

async function main(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { bookId: string };
  const bookId = state.bookId;
  const create = JSON.parse(
    readFileSync(join(TRACE_DIR, "20_batch_cap_create.json"), "utf8")
  ) as { json: { batchId: string } };
  const batchId = create.json.batchId;
  console.log(`=== finalize cap batch ${batchId} ===`);

  const t0 = Date.now();
  let last: unknown = null;
  while (Date.now() - t0 < 540_000) {
    const s = await api<{ batch: { status: string; halted: boolean; haltReason: string | null; spentUsd: number }; counts: Record<string, number> }>(
      "GET",
      `/api/books/${bookId}/batch/${batchId}`
    );
    last = s;
    const b = s.json?.batch;
    console.log(`  poll t+${Math.round((Date.now() - t0) / 1000)}s status=${b?.status} halted=${b?.halted} haltReason=${b?.haltReason} counts=${JSON.stringify(s.json?.counts)} spent=${b?.spentUsd}`);
    if (b && TERMINAL.has(b.status)) break;
    await sleep(8000);
  }
  dump("23_batch_cap_terminal_final", last);

  const sessions = await db.agentSession.findMany({
    where: { batchId },
    select: { chapterNumber: true, status: true, actualCostUsd: true },
    orderBy: { chapterNumber: "asc" },
  });
  const notes = await db.bookNotification.findMany({
    where: { bookId, type: "pipeline_complete" },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { title: true, message: true, priority: true, createdAt: true },
  });
  const dbSpent = sessions.reduce((s, x) => s + Number(x.actualCostUsd ?? 0), 0);
  dump("24_batch_cap_final_analysis", {
    batchId,
    per_session: sessions,
    db_actualCostUsd_sum: dbSpent,
    notifications: notes,
  });
  console.log(`\nsessions: ${JSON.stringify(sessions.map((s) => ({ ch: s.chapterNumber, status: s.status, cost: s.actualCostUsd })))}`);
  console.log(`db spent sum=${dbSpent}`);
  console.log(`notifications: ${JSON.stringify(notes.map((n) => n.message))}`);
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
