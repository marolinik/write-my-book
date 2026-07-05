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
 * Read the Redis ledger for a batch (spent / halted / failures). Best-effort:
 * a Redis hiccup yields zeros/false rather than crashing the digest — the
 * persisted DB rows are the primary source, the ledger only enriches it.
 */
async function readBatchLedger(
  batchId: string
): Promise<{ spentUsd: number; halted: boolean; failureCount: number }> {
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
    };
  } catch (err) {
    console.error("[BatchDigest] Redis ledger read failed (non-fatal):", err);
    return { spentUsd: 0, halted: false, failureCount: 0 };
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

    const findings = childIds.length
      ? await db.editFinding.findMany({
          where: { sessionId: { in: childIds } },
          select: { severity: true, category: true, chapterNumber: true },
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
      workflowIds: batch.workflowIds,
      chapterStart: batch.chapterStart,
      chapterEnd: batch.chapterEnd,
      budgetCapUsd: batch.budgetCapUsd,
      spentUsd: ledger.spentUsd,
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
        spentUsd: ledger.spentUsd,
        halted,
        completedCount,
        failedCount,
        completedAt: new Date(),
      },
    });

    // ── Morning report: one in-app notification (SMTP/push is Phase-2) ──
    const findingSummary =
      digest.findings.total > 0
        ? ` · ${digest.findings.total} findings`
        : "";
    const skippedSummary =
      digest.passes.skipped > 0
        ? ` · ${digest.passes.skipped} skipped`
        : "";
    await db.bookNotification.create({
      data: {
        bookId: batch.bookId,
        userId: batch.userId,
        type: "pipeline_complete",
        priority: halted ? "high" : "normal",
        title: "Overnight batch complete",
        message:
          `${digest.passes.completed}/${digest.passes.total} passes` +
          `${skippedSummary}${findingSummary} · ` +
          `$${ledger.spentUsd.toFixed(2)} / $${batch.budgetCapUsd.toFixed(2)} cap`,
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
