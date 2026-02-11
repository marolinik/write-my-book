import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSession } from "@/lib/agents";
import { z } from "zod";

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
    const body = await req.json();
    const data = approveSchema.parse(body);

    const session = getSession(sessionId);
    if (!session || session.bookId !== bookId || session.userId !== user.id) {
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

    const resolved = session.orchestrator.resolveApproval(data.approvalId, {
      decision: data.decision,
      message: data.message,
    });

    if (!resolved) {
      return NextResponse.json(
        { error: "Approval not found or already resolved" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
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
