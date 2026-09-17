import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Session status, so the client can reconcile what it remembers with what
 * actually happened.
 *
 * The agent panel persists its sessions in localStorage. When a run ends
 * without the client seeing the terminal "complete" event — the dev server
 * restarted, the tab was closed mid-run, the stream dropped — the session stays
 * "running" in that store forever, and every surface that asks "is an agent
 * busy?" spins indefinitely although the work finished long ago.
 *
 * A session left "running" past the hard ceiling is also reconciled here: no
 * run outlives it, so the row is a leftover from a process that died, and
 * reporting it as still running is a lie the UI then repeats.
 */

type RouteParams = {
  params: Promise<{ id: string; sessionId: string }>;
};

/**
 * Longest any session may legitimately stay open. The route-level ceiling is
 * (workflow estimate + 30 min); this is a generous upper bound on that, used
 * only to recognise abandoned rows.
 */
const HARD_CEILING_MS = 4 * 60 * 60 * 1000;

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, sessionId } = await params;

    const session = await db.agentSession.findFirst({
      where: { id: sessionId, bookId, userId: user.id },
      select: {
        id: true,
        status: true,
        workflowId: true,
        agentType: true,
        startedAt: true,
        completedAt: true,
        tokensInput: true,
        tokensOutput: true,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Abandoned by a process that is no longer alive — settle it rather than
    // letting it advertise itself as running for days.
    if (
      session.status === "running" &&
      Date.now() - session.startedAt.getTime() > HARD_CEILING_MS
    ) {
      const settled = await db.agentSession.update({
        where: { id: session.id },
        data: { status: "failed", completedAt: new Date() },
        select: { status: true, completedAt: true },
      });
      return NextResponse.json({
        ...session,
        status: settled.status,
        completedAt: settled.completedAt,
        abandoned: true,
      });
    }

    return NextResponse.json(session);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/agent/:sessionId error:", error);
    return NextResponse.json(
      { error: "Failed to read session" },
      { status: 500 },
    );
  }
}
