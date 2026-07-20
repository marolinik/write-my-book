import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAppConnection } from "@/lib/queue/connection";

type RouteParams = { params: Promise<{ id: string; batchId: string }> };

/**
 * Terminal `BatchRun` statuses. Once reached, the fan-in digest has written the
 * FINAL reconciled row and the live view must return it verbatim — the live
 * derivation below must never overwrite or contradict a terminal batch.
 */
const TERMINAL_BATCH_STATUSES = new Set([
  "done",
  "failed",
  "halted",
  "cancelled",
]);

/**
 * Best-effort read of the live Redis halt flag (`batch:{id}:halted`). A mid-run
 * budget-cap / circuit-breaker halt lives ONLY in Redis until the digest fans
 * in and persists `BatchRun.halted`, so the DB column alone under-reports a
 * halted-but-still-polling batch. Reuses the shared app connection (a lazy
 * singleton — no per-poll connection churn, never disconnected) and returns
 * `false` on any hiccup; the caller OR's in the durable DB column, so a Redis
 * miss can only UNDER-claim, never fabricate, a halt.
 */
async function readLiveHaltFlag(batchId: string): Promise<boolean> {
  try {
    const raw = await getAppConnection().get(`batch:${batchId}:halted`);
    return raw === "1";
  } catch (err) {
    console.error(
      "GET /api/books/:id/batch/:batchId live halt read failed (non-fatal):",
      (err as Error).message ?? err
    );
    return false;
  }
}

/**
 * GET /api/books/:id/batch/:batchId — poll a batch's status + digest.
 *
 * Returns the `BatchRun` row plus LIVE child-status counts aggregated from the
 * linked `AgentSession` rows. The stored `BatchRun` columns lag reality until
 * the fan-in digest runs (status stays `queued`, `spentUsd` stays $0, `startedAt`
 * null) — so D-96: an actively-spending overnight run polled as
 * "queued, 0 running, $0 spent". The `batch` object's `status` / `spentUsd` /
 * `halted` / `startedAt` VALUES are therefore derived from the child rows at
 * read time (same top-level keys + same `batch` shape — only the values are made
 * honest), WITHOUT ever contradicting a terminal batch: once the digest has
 * written a terminal status, that reconciled row is returned verbatim.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, batchId } = await params;

    const batch = await db.batchRun.findFirst({
      where: { id: batchId, bookId, userId: user.id },
    });
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const sessions = await db.agentSession.findMany({
      where: { batchId },
      select: { status: true, actualCostUsd: true, startedAt: true },
    });

    const counts = {
      total: sessions.length,
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };
    for (const s of sessions) {
      if (s.status === "queued") counts.queued++;
      else if (s.status === "running") counts.running++;
      else if (s.status === "completed") counts.completed++;
      else if (s.status === "failed") counts.failed++;
      else if (s.status === "skipped") counts.skipped++;
    }

    // ── D-96: honest live-facing view derived from the child rows ──────
    const isTerminal =
      TERMINAL_BATCH_STATUSES.has(batch.status) || batch.digest != null;

    // Live spend = sum of finalized child costs, floored by the stored spend so
    // a reconciled terminal figure can never regress. (A child's actualCostUsd
    // is written at its own completion, so this rises as children finish; it
    // equals the digest's reconciled spend once every child is terminal.)
    const childSpend = sessions.reduce(
      (sum, s) => sum + Number(s.actualCostUsd ?? 0),
      0
    );
    const liveSpentUsd = Math.max(childSpend, batch.spentUsd ?? 0);

    // Live halt: durable DB column OR the live Redis flag (mid-run halts live
    // only in Redis). A terminal batch uses the digest-written column verbatim —
    // never let a stale Redis flag contradict a terminal 'done'.
    const liveHalted = isTerminal
      ? batch.halted
      : batch.halted || (await readLiveHaltFlag(batchId));

    // Live status: terminal → stored verbatim; else 'running' once any child is
    // running/completed, otherwise still 'queued'.
    const anyChildActive = sessions.some(
      (s) => s.status === "running" || s.status === "completed"
    );
    const liveStatus: typeof batch.status = isTerminal
      ? batch.status
      : anyChildActive
        ? "running"
        : "queued";

    // Live start: earliest child that has left the queue (BatchRun.startedAt is
    // never populated before the digest), else the stored value.
    const startedTimes = sessions
      .filter((s) => s.status !== "queued")
      .map((s) => s.startedAt)
      .filter((d): d is Date => d != null)
      .map((d) => d.getTime());
    const earliestStart =
      startedTimes.length > 0 ? new Date(Math.min(...startedTimes)) : null;

    // Same top-level keys + same `batch` shape — only the VALUES are made
    // honest (immutable copy; the stored row is never mutated).
    const liveBatch = {
      ...batch,
      status: liveStatus,
      spentUsd: liveSpentUsd,
      halted: liveHalted,
      startedAt: batch.startedAt ?? earliestStart,
    };

    return NextResponse.json({ batch: liveBatch, counts });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "GET /api/books/:id/batch/:batchId error:",
      (error as Error).message ?? "Unknown error"
    );
    return NextResponse.json(
      { error: "Failed to load batch" },
      { status: 500 }
    );
  }
}
