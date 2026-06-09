import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSession, cancelSession } from "@/lib/agents";
import { getAppConnection } from "@/lib/queue/connection";
import { agentQueue } from "@/lib/queue/agent-queue";

type RouteParams = {
  params: Promise<{ id: string; sessionId: string }>;
};

/** POST /api/books/:id/agent/:sessionId/cancel — cancel a running session (inline or background). */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, sessionId } = await params;

    // ── Step 1: DB-first lookup (consistent with stream/approve routes) ──

    const dbSession = await db.agentSession.findFirst({
      where: { id: sessionId, bookId, userId: user.id },
      select: { jobId: true, status: true },
    });

    if (!dbSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // ── Step 2: Idempotent — already terminal ────────────────────────────

    if (dbSession.status === "completed" || dbSession.status === "failed") {
      return NextResponse.json({ ok: true, alreadyDone: true });
    }

    // ── Step 3: Determine cancel path ────────────────────────────────────

    const isBackgroundJob = dbSession.jobId != null;

    if (isBackgroundJob) {
      // ── Background path: Redis + BullMQ ────────────────────────────
      const redis = getAppConnection();

      // Publish terminal error event to SSE channel so frontend stops spinner
      const cancelMsg = JSON.stringify({
        type: "error",
        content: "Session cancelled by user",
      });
      await redis.publish(`session:${sessionId}`, cancelMsg);
      await redis.rpush(`session:${sessionId}:messages`, cancelMsg);

      // Set terminal status key for polling clients
      await redis.set(
        `session:${sessionId}:status`,
        "failed",
        "EX",
        86400
      );

      // Set cancellation flag for worker to detect during processing
      await redis.set(
        `session:${sessionId}:cancel`,
        "true",
        "EX",
        3600
      );

      // Try to remove from queue if still waiting/delayed
      try {
        const job = await agentQueue.getJob(dbSession.jobId!);
        if (job) {
          const state = await job.getState();
          if (state === "waiting" || state === "delayed") {
            await job.remove();
          }
        }
      } catch (removeErr) {
        // Best-effort queue removal — job may already be active
        console.warn(
          "[Cancel] Could not remove job from queue:",
          removeErr
        );
      }
    } else {
      // ── Inline path: existing in-memory cancellation ───────────────
      const session = getSession(sessionId);
      if (session) {
        cancelSession(sessionId);
      }
      // If not found in-memory (session already GC'd), continue to DB update
    }

    // ── Step 4: Update DB status ─────────────────────────────────────────

    await db.agentSession.update({
      where: { id: sessionId },
      data: {
        status: "failed",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "POST /api/books/:id/agent/:sessionId/cancel error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to cancel session" },
      { status: 500 }
    );
  }
}
