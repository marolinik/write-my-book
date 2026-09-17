import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyStructureMove } from "@/lib/structure/apply-move";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

/**
 * POST /api/books/:id/structure/moves/:moveId/decision
 *
 * The writer's verdict on one proposed structural move (O12). Accept is the ONLY
 * path in the feature that mutates the manuscript; reject writes a status and
 * the writer's reason and touches nothing else.
 *
 * An apply that cannot run answers 409 with the engine's own reason (the anchor
 * quote is gone, the chapter was deleted, the move is no longer pending) instead
 * of a generic 500 — the writer needs to know WHICH assumption stopped being
 * true, because it is usually their own edit that made it untrue.
 */

const decisionSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  reason: z.string().max(2000).optional(),
});

type RouteParams = { params: Promise<{ id: string; moveId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, moveId } = await params;
    const { decision, reason } = decisionSchema.parse(await parseJsonBody(req));

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (decision === "reject") {
      // updateMany, not update: the move id must belong to THIS book, or a
      // guessed id from another writer's book would be decided from here. The
      // apply path gets the same fence inside the engine.
      const { count } = await db.structureMove.updateMany({
        where: { id: moveId, bookId },
        data: {
          status: "rejected",
          rejectionReason: reason ?? null,
          decidedAt: new Date(),
        },
      });
      if (count === 0) {
        return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
      }
      return NextResponse.json({ applied: false, status: "rejected" });
    }

    const result = await applyStructureMove(moveId, { bookId, userId: user.id });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 409 }
      );
    }

    return NextResponse.json({ applied: true, summary: result.summary });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("POST /api/books/:id/structure/moves/:moveId/decision error:", error);
    return NextResponse.json({ error: "Failed to decide" }, { status: 500 });
  }
}
