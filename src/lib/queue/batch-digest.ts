/**
 * Fan-in digest processor for overnight/batch editorial runs.
 *
 * Runs on the NEW `batch-digest` queue as the FlowProducer PARENT job: BullMQ
 * releases it only once every child of the batch is terminal. It reads the
 * already-persisted per-child artifacts (EditFinding + AgentSession +
 * UsageRecord + Chapter) plus the Redis ledger, aggregates them into
 * `BatchRun.digest`, sets the terminal `BatchRun.status`/`haltReason`, and fires
 * one `BookNotification('pipeline_complete')` so the writer gets a morning
 * report (BATCH-SPEC §6).
 *
 * DEFENSIVELY WRAPPED (BATCH-SPEC §3.5): the digest Worker shares ONE process
 * with the agent Worker whose `uncaughtException` handler calls `process.exit(1)`
 * (`worker.ts`). A crash inside the digest MUST NOT down the agent Worker — so
 * every path is caught and, on failure, we write a `failed`-status digest rather
 * than throwing to the process level.
 */

import type { Job } from "bullmq";
import { createRedisConnection } from "./connection";
import type { BatchDigestJobData } from "./batch-flow";
import {
  aggregateBatchDigest,
  type BatchDigestSessionInput,
  type BatchDigestFindingInput,
  type BatchDigestChapterInput,
} from "@/lib/agents/batch-digest-aggregate";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Format a USD cap for the morning notification. Two decimals for normal
 * amounts, but a positive SUB-CENT cap (e.g. a $0.005 QA cap) must not collapse
 * to "$0.00" — or misleadingly round to "$0.01" — via `toFixed(2)`. Show enough
 * precision to name the real cap (D-98), trimming trailing zeros. The spend
 * figure itself is left at `toFixed(2)` (BATCH-SPEC / D-98: keep as-is).
 */
function formatCapUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n >= 0.01) return n.toFixed(2);
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Read the Redis ledger for a batch (spent / halted / failures). Best-effort:
 * a Redis hiccup yields zeros/false rather than crashing the digest — the
 * persisted DB rows are the primary source, the ledger only enriches it.
 */
async function readBatchLedger(batchId: string): Promise<{
  spentUsd: number;
  halted: boolean;
  failureCount: number;
  ledgerAvailable: boolean;
}> {
  const redis = createRedisConnection();
  try {
    const [spentRaw, haltedRaw, failuresRaw] = await Promise.all([
      redis.get(`batch:${batchId}:spent`),
      redis.get(`batch:${batchId}:halted`),
      redis.get(`batch:${batchId}:failures`),
    ]);
    return {
      spentUsd: spentRaw ? parseFloat(spentRaw) : 0,
      halted: haltedRaw === "1",
      failureCount: failuresRaw ? parseInt(failuresRaw, 10) : 0,
      ledgerAvailable: true,
    };
  } catch (err) {
    // A Redis hiccup must NOT be reported as "$0 spent" — that would overwrite
    // the real BatchRun.spentUsd with zero and can mislabel a halted batch as
    // done. Signal unavailability so the caller falls back to the DB-side sum.
    console.error("[BatchDigest] Redis ledger read failed (non-fatal):", err);
    return { spentUsd: 0, halted: false, failureCount: 0, ledgerAvailable: false };
  } finally {
    redis.disconnect();
  }
}

/**
 * Process a batch digest (fan-in) job. NEVER throws to the process level.
 */
export async function processBatchDigestJob(
  job: Job<BatchDigestJobData>
): Promise<void> {
  const { batchId } = job.data;

  try {
    const batch = await db.batchRun.findUnique({ where: { id: batchId } });
    if (!batch) {
      console.error(`[BatchDigest] BatchRun ${batchId} not found — skipping.`);
      return;
    }

    // ── Read all persisted child artifacts directly (NOT ephemeral state) ──
    const sessions = await db.agentSession.findMany({
      where: { batchId },
      select: {
        id: true,
        status: true,
        chapterNumber: true,
        workflowId: true,
        actualCostUsd: true,
      },
    });
    const childIds = sessions.map((s) => s.id);

    // D-122: `status` is load-bearing here — the CreateFinding validation gate
    // persists auto-rejected rows as rejection analytics, and counting them made
    // the digest over-claim (7 reported vs 5 the writer can see).
    // `aggregateBatchDigest` splits them out.
    const findings = childIds.length
      ? await db.editFinding.findMany({
          where: { sessionId: { in: childIds } },
          select: {
            severity: true,
            category: true,
            chapterNumber: true,
            status: true,
          },
        })
      : [];

    const chapters = await db.chapter.findMany({
      where: {
        bookId: batch.bookId,
        chapterNumber: { gte: batch.chapterStart, lte: batch.chapterEnd },
      },
      select: { chapterNumber: true, status: true, betaGate: true },
    });

    const ledger = await readBatchLedger(batchId);

    // If the Redis ledger was unavailable, do NOT trust its $0 — fall back to
    // the DB-side truth (sum of persisted per-session actualCostUsd, floored by
    // the already-persisted BatchRun.spentUsd) so a Redis hiccup can't zero out
    // the reported spend or mislabel the batch (Z11).
    const dbSpent = sessions.reduce(
      (sum, s) => sum + Number(s.actualCostUsd ?? 0),
      0
    );
    // The reported figure is also FLOORED by whatever is already persisted
    // (D-186a): a mid-run cancel now writes the spend it derived from the child
    // rows, so `BatchRun.spentUsd` can legitimately be non-zero before the
    // digest lands. A ledger that reads lower (partial increment, key TTL, a
    // child billed to the DB but not the ledger) must never SHRINK a money
    // figure the writer was already shown.
    const effectiveSpent = Math.max(
      ledger.ledgerAvailable ? ledger.spentUsd : dbSpent,
      batch.spentUsd ?? 0
    );

    // The batch is cancelled iff a cancel already set that terminal state; the
    // digest still runs (BATCH-SPEC §2.1) but must not relabel it done/halted.
    const cancelled = batch.status === "cancelled";
    const halted = ledger.halted || batch.halted;

    const sessionInputs: BatchDigestSessionInput[] = sessions.map((s) => ({
      status: s.status,
      chapterNumber: s.chapterNumber,
      workflowId: s.workflowId,
      actualCostUsd: s.actualCostUsd,
    }));
    const findingInputs: BatchDigestFindingInput[] = findings.map((f) => ({
      severity: f.severity,
      category: f.category,
      chapterNumber: f.chapterNumber,
      status: f.status,
    }));
    const chapterInputs: BatchDigestChapterInput[] = chapters.map((c) => ({
      chapterNumber: c.chapterNumber,
      status: c.status,
      betaGate: c.betaGate,
    }));

    const {
      digest,
      status,
      haltReason,
      completedCount,
      failedCount,
    } = aggregateBatchDigest({
      // effectiveSpent (Z11) — ledger value when available, DB-side sum otherwise.
      workflowIds: batch.workflowIds,
      chapterStart: batch.chapterStart,
      chapterEnd: batch.chapterEnd,
      budgetCapUsd: batch.budgetCapUsd,
      spentUsd: effectiveSpent,
      halted,
      cancelled,
      failureCount: ledger.failureCount,
      sessions: sessionInputs,
      findings: findingInputs,
      chapters: chapterInputs,
    });

    await db.batchRun.update({
      where: { id: batchId },
      data: {
        digest: digest as unknown as Prisma.InputJsonValue,
        status,
        haltReason: haltReason ?? null,
        spentUsd: effectiveSpent,
        halted,
        completedCount,
        failedCount,
        completedAt: new Date(),
      },
    });

    // ── Morning report: one in-app notification (SMTP/push is Phase-2) ──
    // D-122: the headline count is what the writer will SEE (gate-rejected rows
    // excluded by aggregateBatchDigest). Discarded rows are still NAMED, so a
    // shrunken count is explained instead of reading as a silent zero.
    const suppressedFindings = digest.findings.suppressed;
    const suppressedClause =
      suppressedFindings > 0
        ? ` (${suppressedFindings} discarded as invalid)`
        : "";
    const findingSummary =
      digest.findings.total > 0 || suppressedFindings > 0
        ? ` · ${digest.findings.total} findings${suppressedClause}`
        : "";
    const skippedSummary =
      digest.passes.skipped > 0
        ? ` · ${digest.passes.skipped} skipped`
        : "";

    // ── D-98: title + message reflect a non-'done' terminal outcome ──────
    // Before this fix EVERY digest (halted / cancelled / failed included) was
    // titled "Overnight batch complete" and the message never named the halt, so
    // a budget-cap or provider-outage stop read as a clean finish. Derive an
    // honest title + a short halt clause from the derived terminal status +
    // haltReason. `status`/`haltReason` come from aggregateBatchDigest above.
    let title: string;
    let haltClause: string;
    if (status === "halted") {
      title =
        haltReason === "budget_cap"
          ? "Overnight batch halted — budget cap reached"
          : "Overnight batch halted — repeated provider errors";
      haltClause =
        haltReason === "budget_cap"
          ? " · halted at budget cap"
          : " · halted after provider errors";
    } else if (status === "cancelled") {
      title = "Overnight batch cancelled";
      haltClause = " · cancelled";
    } else if (status === "failed") {
      title = "Overnight batch failed — no passes completed";
      haltClause = " · no passes completed";
    } else {
      title = "Overnight batch complete";
      haltClause = "";
    }

    await db.bookNotification.create({
      data: {
        bookId: batch.bookId,
        userId: batch.userId,
        type: "pipeline_complete",
        priority: halted ? "high" : "normal",
        title,
        message:
          `${digest.passes.completed}/${digest.passes.total} passes` +
          `${skippedSummary}${findingSummary}${haltClause} · ` +
          `$${effectiveSpent.toFixed(2)} / $${formatCapUsd(batch.budgetCapUsd)} cap`,
        actionUrl: `/books/${batch.bookId}`,
        actionLabel: "View digest",
      },
    });
  } catch (err) {
    // Defensive last resort: a digest crash must NOT propagate to the shared
    // worker process (would trip uncaughtException → process.exit(1) and take
    // the agent Worker down too). Record a failed-status digest if we still can.
    console.error(
      `[BatchDigest] Fatal error building digest for batch ${batchId}:`,
      err instanceof Error ? err.message : err
    );
    try {
      await db.batchRun.update({
        where: { id: batchId },
        data: { status: "failed", completedAt: new Date() },
      });
    } catch (inner) {
      console.error(
        `[BatchDigest] Could not write failed status for batch ${batchId}:`,
        inner instanceof Error ? inner.message : inner
      );
    }
    // Swallow — never re-throw.
  }
}
