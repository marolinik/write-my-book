import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deriveLiveBatchFields,
  isBatchTerminal,
  readLiveHaltFlag,
} from "@/lib/batch/live-batch-view";

type RouteParams = { params: Promise<{ id: string; batchId: string }> };

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
    // Shared with the LIST route (D-120) via `@/lib/batch/live-batch-view` so
    // the two surfaces can never disagree about the same batch. A terminal
    // batch never consults Redis — its reconciled row wins verbatim.
    const liveHalted = isBatchTerminal(batch)
      ? false
      : await readLiveHaltFlag(batchId);

    // Same top-level keys + same `batch` shape — only the VALUES are made
    // honest (immutable copy; the stored row is never mutated).
    const liveBatch = {
      ...batch,
      ...deriveLiveBatchFields(batch, sessions, liveHalted),
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
