import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAppConnection } from "@/lib/queue/connection";
import { BATCH_DIGEST_QUEUE_NAME } from "@/lib/queue/batch-flow";

type RouteParams = { params: Promise<{ id: string; batchId: string }> };

/**
 * Module-level Queue handle for the digest/parent jobs, reusing the shared app
 * connection (same singleton pattern as `agentQueue`) so we don't open a new
 * Redis connection per cancel request.
 */
const batchDigestQueue = new Queue(BATCH_DIGEST_QUEUE_NAME, {
  connection: getAppConnection(),
});

/** Batch lifecycle states that are already terminal — cancel is a no-op. */
const TERMINAL_STATUSES = new Set(["done", "failed", "cancelled"]);

/**
 * POST /api/books/:id/batch/:batchId/cancel — cancel a batch (BATCH-SPEC §7.1).
 *
 * Sets the Redis `batch:{id}:halted` flag so the pre-child guard skips every
 * not-yet-dispatched child, marks the `BatchRun` cancelled, and best-effort
 * removes the parent digest job if it is still delayed/waiting. In-flight
 * children finish on their own (they can't be interrupted mid-run in v1); the
 * digest still runs so the writer gets a partial morning report.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, batchId } = await params;

    const batch = await db.batchRun.findFirst({
      where: { id: batchId, bookId, userId: user.id },
      select: { id: true, status: true, parentJobId: true },
    });
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    // Idempotent: already terminal.
    if (TERMINAL_STATUSES.has(batch.status)) {
      return NextResponse.json({ ok: true, alreadyDone: true });
    }

    // Load-bearing: trip the Redis halt flag the pre-child guard consults, so
    // every remaining child short-circuits to 'skipped' instead of spending.
    const redis = getAppConnection();
    await redis.set(`batch:${batchId}:halted`, "1");

    await db.batchRun.update({
      where: { id: batchId },
      data: { status: "cancelled", halted: true, haltReason: "cancelled" },
    });

    // Best-effort: drop the parent digest job if it hasn't been released yet.
    if (batch.parentJobId) {
      try {
        const job = await batchDigestQueue.getJob(batch.parentJobId);
        if (job) {
          const state = await job.getState();
          if (
            state === "delayed" ||
            state === "waiting" ||
            state === "waiting-children"
          ) {
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

    return NextResponse.json({ ok: true });
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
