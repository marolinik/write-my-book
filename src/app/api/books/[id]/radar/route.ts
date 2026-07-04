import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildRadarAlerts } from "@/lib/radar/alerts";
import { localeFor } from "@/lib/i18n/ui-strings";

export const dynamic = "force-dynamic";

/**
 * GET /api/books/[id]/radar
 * Returns story health alerts from two word-count heuristics:
 *   - pacing:    chapters that are length outliers vs the book average
 *   - structure: chapters left unchanged for a long time (staleness)
 * It does NOT analyze continuity, character, or style — see
 * src/lib/radar/alerts.ts for the single source of truth on emitted types.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id: bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    include: {
      chapters: {
        select: { chapterNumber: true, title: true, status: true, updatedAt: true, wordCount: true },
        orderBy: { chapterNumber: "asc" },
      },
      _count: { select: { documents: true } },
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const alerts = buildRadarAlerts(
    book.chapters,
    Date.now(),
    localeFor(user.preferredLanguage ?? "en")
  );

  return NextResponse.json({
    alerts,
    lastAnalyzed: new Date().toISOString(),
    bookHealth: alerts.length === 0 ? "good" : alerts.some(a => a.severity === "critical") ? "critical" : "needs-attention",
  });
}
