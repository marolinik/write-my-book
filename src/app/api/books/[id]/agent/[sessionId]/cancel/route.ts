import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSession, cancelSession } from "@/lib/agents";

type RouteParams = {
  params: Promise<{ id: string; sessionId: string }>;
};

/** POST /api/books/:id/agent/:sessionId/cancel — cancel a running session. */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, sessionId } = await params;

    const session = getSession(sessionId);
    if (!session || session.bookId !== bookId || session.userId !== user.id) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    cancelSession(sessionId);

    // Update DB record
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
