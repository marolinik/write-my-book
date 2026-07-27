import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAppConnection } from "@/lib/queue/connection";
import { BATCH_DIGEST_QUEUE_NAME } from "@/lib/queue/batch-flow";
import {
  deriveLiveBatchFields,
  isBatchTerminal,
} from "@/lib/batch/live-batch-view";

type RouteParams = { params: Promise<{ id: string; batchId: string }> };

/**
 * Module-level Queue handle for the digest/parent jobs, reusing the shared app
 * connection (same singleton pattern as `agentQueue`) so we don't open a new
 * Redis connection per cancel request.
 */
const batchDigestQueue = new Queue(BATCH_DIGEST_QUEUE_NAME, {
  connection: getAppConnection(),
});

/**
 * TTL for the Redis halt flag (24h), mirroring `agent-worker.ts` REDIS_TTL_SECONDS.
 * A cancel can set `:halted` BEFORE any child runs (e.g. cancelling an evening-
 * scheduled 2am batch), so bound its lifetime instead of leaking a key forever.
 */
const HALT_FLAG_TTL_SECONDS = 86_400;

/**
 * POST /api/books/:id/batch/:batchId/cancel — cancel a batch (BATCH-SPEC §7.1).
 *
 * Sets the Redis `batch:{id}:halted` flag so the pre-child guard skips every
 * not-yet-dispatched child, marks the `BatchRun` cancelled, and best-effort
 * removes the parent digest job if it is still delayed/waiting. In-flight
 * children finish on their own (they can't be interrupted mid-run in v1); the
 * digest still runs so the writer gets a partial morning report.
 *
 * D-186a — the cancel is also the LAST read-time derivation this batch will
 * ever get: `cancelled` is TERMINAL, and terminal rows are served VERBATIM by
 * the shared live view (`live-batch-view.ts` rule 1). So the same update that
 * flips the status must persist the money/progress values the live view would
 * otherwise have derived, or the writer sees "$0.00 · 0 done" for a run that
 * really spent — from the cancel click until the fan-in digest reconciles it,
 * which can be hours away while in-flight children finish. The derivation is
 * shared with both read routes and can only UNDER-claim (child costs are booked
 * at each child's own settle, and the stored value is a floor), so the figure
 * written here is honest-but-partial, never inflated; the digest still has the
 * final word.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, batchId } = await params;

    const batch = await db.batchRun.findFirst({
      where: { id: batchId, bookId, userId: user.id },
      select: {
        id: true,
        status: true,
        parentJobId: true,
        // D-186a: the stored money/progress columns the cancel must reconcile.
        // `completedAt` is the cheap terminal marker (written in the SAME update
        // as the terminal status by the digest) — the heavy `digest` JSON is
        // deliberately NOT selected.
        spentUsd: true,
        halted: true,
        startedAt: true,
        completedCount: true,
        failedCount: true,
        completedAt: true,
      },
    });
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Idempotent: already terminal (ONE shared terminal set — D-186c). A
    // 'halted' batch is one the digest already reconciled, so re-flipping it to
    // 'cancelled' here would overwrite a truthful haltReason with a lie.
    if (isBatchTerminal(batch)) {
      return NextResponse.json({ ok: true, alreadyDone: true });
    }

    // Load-bearing: trip the Redis halt flag the pre-child guard consults, so
    // every remaining child short-circuits to 'skipped' instead of spending.
    const redis = getAppConnection();
    await redis.set(`batch:${batchId}:halted`, "1", "EX", HALT_FLAG_TTL_SECONDS);

    // D-186a: read the children AFTER the halt flag is set (nothing new can
    // start spending from here) and persist what the live view would derive.
    // `liveHalted: true` is a fact, not a guess — we just set that flag.
    //
    // Best-effort by design: stopping the spend and flipping the status are the
    // load-bearing halves of a cancel, so a failed child read must NOT abort
    // them. It degrades to the stored values (every derived field is floored by
    // them), i.e. the pre-D-186a behaviour for this one request, and says so in
    // the log rather than swallowing it.
    let children: Array<{
      status: string;
      actualCostUsd: number | null;
      startedAt: Date | null;
    }> = [];
    try {
      children = await db.agentSession.findMany({
        where: { batchId },
        select: { status: true, actualCostUsd: true, startedAt: true },
      });
    } catch (childErr) {
      console.error(
        `[batch:cancel] child read failed for ${batchId}; cancelling with stored money state:`,
        (childErr as Error).message ?? "Unknown error"
      );
    }
    const live = deriveLiveBatchFields(batch, children, true);

    await db.batchRun.update({
      where: { id: batchId },
      data: {
        status: "cancelled",
        halted: true,
        haltReason: "cancelled",
        // Honest-but-partial money + progress state at the cancel instant.
        // Every value is floored by what was already stored, so this can only
        // ever raise a figure, never regress one. `completedAt` stays unwritten:
        // in-flight children are still running, and the digest owns that mark.
        spentUsd: live.spentUsd,
        startedAt: live.startedAt,
        completedCount: live.completedCount,
        failedCount: live.failedCount,
      },
    });

    // Best-effort: drop the parent digest job if it hasn't been released yet.
    if (batch.parentJobId) {
      try {
        const job = await batchDigestQueue.getJob(batch.parentJobId);
        if (job) {
          const state = await job.getState();
          // Only drop the parent while it is still genuinely un-started
          // ('delayed'/'waiting'). A scheduled batch's parent is
          // 'waiting-children' (its delayed children haven't resolved yet) —
          // removing it there would SUPPRESS the fan-in digest for an in-flight
          // batch, contradicting "the digest still runs so the writer gets a
          // partial morning report" (BATCH-SPEC §2.1). Let it stay: the halt
          // flag above is what actually stops spend; the parent still fires the
          // digest once the (now-skipping) children resolve.
          if (state === "delayed" || state === "waiting") {
            await job.remove();
          }
        }
      } catch (removeErr) {
        // The parent may already be active or have children in flight; the
        // halt flag is what actually stops spend, so this is non-fatal.
        console.warn(
          "[BatchCancel] Could not remove parent digest job:",
          removeErr
        );
      }
    }

    // Echo the reconciled spend so the caller (and a capture/network log) can
    // see the real figure at the moment of cancel rather than a bare `ok`.
    return NextResponse.json({ ok: true, spentUsd: live.spentUsd });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "POST /api/books/:id/batch/:batchId/cancel error:",
      (error as Error).message ?? "Unknown error"
    );
    return NextResponse.json(
      { error: "Failed to cancel batch" },
      { status: 500 }
    );
  }
}
