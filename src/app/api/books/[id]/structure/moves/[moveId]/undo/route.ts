import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { undoStructureMove } from "@/lib/structure/apply-move";

/**
 * POST /api/books/:id/structure/moves/:moveId/undo
 *
 * Put an applied structural move back (O12). Restores the chapter rows, their
 * numbering and their prose from the snapshot the apply engine captured. A move
 * that was never applied answers 409 rather than pretending to undo something.
 */
type RouteParams = { params: Promise<{ id: string; moveId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, moveId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const result = await undoStructureMove(moveId, { bookId, userId: user.id });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 409 }
      );
    }

    return NextResponse.json({ undone: true, summary: result.summary });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/books/:id/structure/moves/:moveId/undo error:", error);
    return NextResponse.json({ error: "Failed to undo" }, { status: 500 });
  }
}
