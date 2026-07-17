import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSession } from "@/lib/agents";
import { getAppConnection } from "@/lib/queue";
import { z } from "zod";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = {
  params: Promise<{ id: string; sessionId: string }>;
};

const approveSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["approve", "reject", "modify"]),
  message: z.string().max(10000).optional(),
});

/** POST /api/books/:id/agent/:sessionId/approve — resolve an approval gate. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, sessionId } = await params;
    const body = await parseJsonBody(req);
    const data = approveSchema.parse(body);

    // ── Check DB for session and determine path ──────────────────────
    const dbSession = await db.agentSession.findFirst({
      where: { id: sessionId, bookId, userId: user.id },
      select: { jobId: true },
    });

    if (!dbSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const isBackgroundJob = dbSession.jobId != null;

    if (isBackgroundJob) {
      // ── Background Job Path: Redis-based approval resolution ───────
      const redis = getAppConnection();
      const approvalKey = `approval:${data.approvalId}`;

      const existing = await redis.get(approvalKey);
      if (!existing) {
        return NextResponse.json(
          { error: "Approval not found or expired" },
          { status: 404 }
        );
      }

      const parsed = JSON.parse(existing);
      if (parsed.status !== "pending") {
        return NextResponse.json(
          { error: "Approval already resolved" },
          { status: 409 }
        );
      }

      // Write resolved state — worker polls this key every 2 seconds
      await redis.set(
        approvalKey,
        JSON.stringify({
          status: "resolved",
          decision: data.decision,
          message: data.message,
        }),
        "EX",
        600 // 10 min TTL
      );

      return NextResponse.json({ ok: true });
    } else {
      // ── Inline Job Path: In-Memory approval resolution (unchanged) ─

      const session = getSession(sessionId);
      if (
        !session ||
        session.bookId !== bookId ||
        session.userId !== user.id
      ) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      if (!session.orchestrator) {
        return NextResponse.json(
          { error: "No active orchestrator" },
          { status: 400 }
        );
      }

      // Try the main orchestrator first
      let resolved = session.orchestrator.resolveApproval(data.approvalId, {
        decision: data.decision,
        message: data.message,
      });

      // If not found on main orchestrator, check sub-orchestrators (specialist delegations)
      if (!resolved && session.subOrchestrators.size > 0) {
        for (const [, subOrchestrator] of session.subOrchestrators) {
          resolved = subOrchestrator.resolveApproval(data.approvalId, {
            decision: data.decision,
            message: data.message,
          });
          if (resolved) break;
        }
      }

      if (!resolved) {
        return NextResponse.json(
          { error: "Approval not found or already resolved" },
          { status: 404 }
        );
      }

      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error(
      "POST /api/books/:id/agent/:sessionId/approve error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to resolve approval" },
      { status: 500 }
    );
  }
}
