import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/editorial/summary — Aggregated editorial stats. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const [severityGroups, statusGroups, chaptersWithPending] =
      await Promise.all([
        db.editFinding.groupBy({
          by: ["severity"],
          where: { bookId },
          _count: { id: true },
        }),
        db.editFinding.groupBy({
          by: ["status"],
          where: { bookId },
          _count: { id: true },
        }),
        db.editFinding.groupBy({
          by: ["chapterNumber"],
          where: { bookId, status: "pending" },
        }),
      ]);

    const bySeverity: Record<string, number> = {};
    for (const g of severityGroups) {
      bySeverity[g.severity] = g._count.id;
    }

    const byStatus: Record<string, number> = {};
    for (const g of statusGroups) {
      byStatus[g.status] = g._count.id;
    }

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const pending = byStatus["pending"] ?? 0;
    const applied = byStatus["applied"] ?? 0;
    const dismissed = byStatus["dismissed"] ?? 0;

    return NextResponse.json({
      total,
      pending,
      applied,
      dismissed,
      bySeverity,
      byStatus,
      chaptersWithPending: chaptersWithPending.length,
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/editorial/summary error:", error);
    return NextResponse.json(
      { error: "Failed to get editorial summary" },
      { status: 500 }
    );
  }
}
