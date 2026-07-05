import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string; batchId: string }> };

/**
 * GET /api/books/:id/batch/:batchId — poll a batch's status + digest.
 *
 * Returns the `BatchRun` row plus LIVE child-status counts aggregated from the
 * linked `AgentSession` rows, so a caller polling before the fan-in digest job
 * has run still sees accurate progress (the digest later reconciles the stored
 * `completedCount`/`failedCount`).
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
      select: { status: true },
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

    return NextResponse.json({ batch, counts });
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
