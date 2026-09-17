import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/books/:id/structure/moves
 *
 * The structural-revision proposals for a book (O12). Newest first, pending
 * moves are the ones the writer still has to decide. The stored payload is
 * parsed here so the client never has to know it is JSON in a text column.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const rows = await db.structureMove.findMany({
      where: { bookId },
      orderBy: [{ createdAt: "desc" }],
    });

    const moves = rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      status: m.status,
      reason: m.reason,
      evidence: m.evidence,
      confidence: m.confidence,
      resultSummary: m.resultSummary,
      rejectionReason: m.rejectionReason,
      createdAt: m.createdAt,
      appliedAt: m.appliedAt,
      payload: safeParse(m.payload),
    }));

    return NextResponse.json({ moves });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/structure/moves error:", error);
    return NextResponse.json(
      { error: "Failed to load structure proposals" },
      { status: 500 }
    );
  }
}

/** A payload that cannot be parsed is data damage, not a crash: report it as null. */
function safeParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
