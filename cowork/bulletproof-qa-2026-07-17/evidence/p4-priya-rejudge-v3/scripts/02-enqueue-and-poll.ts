/**
 * Step 2 drill 1 (D-96) / drill 2 (D-98 halt) — enqueue a batch across the
 * 3 fixture chapters and poll the LIVE batch GET route every ~1.2s, writing
 * each poll (timestamp + full JSON + latency) to poll-timelines/<run>.jsonl.
 *
 * Usage: tsx 02-enqueue-and-poll.ts <run-label> <budgetCapUsd> [maxSeconds]
 *   run1  0.50   → healthy run, must not halt
 *   halt  0.005  → sub-cent cap, must halt
 *
 * ACCEPTANCE checks are computed after the run and printed as JSON.
 */
import { api, nowIso, sleep } from "./_helper";
import { readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");
const runLabel = process.argv[2] ?? "run1";
const cap = Number(process.argv[3] ?? "0.50");
const maxSeconds = Number(process.argv[4] ?? "240");

interface Fixture {
  bookId: string;
  chapters: { chapterNumber: number; chapterId: string }[];
}

interface BatchPoll {
  batch: {
    id: string;
    status: string;
    spentUsd: number;
    halted: boolean;
    haltReason: string | null;
    budgetCapUsd: number;
    startedAt: string | null;
    completedAt: string | null;
    digest: unknown;
  };
  counts: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    skipped: number;
  };
}

const TERMINAL = new Set(["done", "failed", "halted", "cancelled"]);

async function main() {
  const fixture: Fixture = JSON.parse(
    readFileSync(join(OUT, "fixture.json"), "utf8")
  );
  const bookId = fixture.bookId;
  const jsonlPath = join(OUT, "poll-timelines", `${runLabel}.jsonl`);
  writeFileSync(jsonlPath, ""); // truncate

  // ── Enqueue: line-edit (chapter-scoped, non-mutating, batch-eligible) ──
  const enqTs = nowIso();
  const enq = await api<{ batchId: string; childCount: number }>(
    "POST",
    `/api/books/${bookId}/batch`,
    {
      workflowIds: ["line-edit"],
      chapterStart: 1,
      chapterEnd: 3,
      budgetCapUsd: cap,
      scheduleMode: "now",
    }
  );
  appendFileSync(
    jsonlPath,
    JSON.stringify({
      event: "enqueue",
      ts: enqTs,
      status: enq.status,
      latencyMs: enq.latencyMs,
      body: enq.body,
    }) + "\n"
  );
  if (enq.status !== 201) {
    console.error("ENQUEUE FAILED", enq.status, enq.raw);
    process.exit(1);
  }
  const batchId = enq.body.batchId;

  // ── Poll loop ──────────────────────────────────────────────────────
  const t0 = Date.now();
  let firstRunningSeen = false;
  let firstSpendSeen = false;
  let firstNonQueuedSeen = false;
  let firstStartedAtSeen = false;
  let pollCount = 0;
  let lastPoll: (BatchPoll & { _ts: string; _latencyMs: number }) | null = null;
  const acceptanceMoments: Record<string, unknown> = {};

  while ((Date.now() - t0) / 1000 < maxSeconds) {
    const p = await api<BatchPoll>(
      "GET",
      `/api/books/${bookId}/batch/${batchId}`
    );
    pollCount++;
    const ts = nowIso();
    const rec = { event: "poll", n: pollCount, ts, latencyMs: p.latencyMs, status: p.status, ...p.body };
    appendFileSync(jsonlPath, JSON.stringify(rec) + "\n");
    const body = p.body as BatchPoll;
    lastPoll = { ...body, _ts: ts, _latencyMs: p.latencyMs };

    const terminal =
      body?.batch && TERMINAL.has(body.batch.status);

    // capture acceptance moments (first time each is observed mid-run)
    if (body?.counts?.running > 0 && !firstRunningSeen) {
      firstRunningSeen = true;
      acceptanceMoments.firstRunning = { poll: pollCount, ts, counts: body.counts, status: body.batch.status };
    }
    if (body?.batch?.spentUsd > 0 && !firstSpendSeen && !terminal) {
      firstSpendSeen = true;
      acceptanceMoments.firstMidRunSpend = { poll: pollCount, ts, spentUsd: body.batch.spentUsd, status: body.batch.status, counts: body.counts };
    }
    if (body?.batch?.status && body.batch.status !== "queued" && !firstNonQueuedSeen) {
      firstNonQueuedSeen = true;
      acceptanceMoments.firstNonQueuedStatus = { poll: pollCount, ts, status: body.batch.status, counts: body.counts };
    }
    if (body?.batch?.startedAt && !firstStartedAtSeen) {
      firstStartedAtSeen = true;
      acceptanceMoments.firstStartedAt = { poll: pollCount, ts, startedAt: body.batch.startedAt, status: body.batch.status };
    }

    if (terminal) {
      acceptanceMoments.terminal = { poll: pollCount, ts, batch: body.batch, counts: body.counts };
      break;
    }
    await sleep(1200);
  }

  // ── Fetch the digest-reconciled row via the list route for cross-check ──
  const listRow = await api<{ batches: unknown[] }>(
    "GET",
    `/api/books/${bookId}/batch`
  );

  const summary = {
    runLabel,
    cap,
    batchId,
    enqueueLatencyMs: enq.latencyMs,
    childCount: enq.body.childCount,
    pollCount,
    acceptance: {
      a_running_gt0: firstRunningSeen,
      b_midrun_spend_gt0: firstSpendSeen,
      c_status_not_queued_when_working: firstNonQueuedSeen,
      d_startedAt_nonnull_midrun: firstStartedAtSeen,
    },
    acceptanceMoments,
    finalPoll: lastPoll,
    listRow: (listRow.body as { batches?: unknown[] })?.batches?.find(
      (b) => (b as { id: string }).id === batchId
    ),
  };
  writeFileSync(
    join(OUT, "poll-timelines", `${runLabel}-summary.json`),
    JSON.stringify(summary, null, 2)
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("POLL DRILL ERROR", e);
  process.exit(1);
});
