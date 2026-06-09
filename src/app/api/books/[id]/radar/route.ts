import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/books/[id]/story-radar
 * Returns proactive story health alerts based on manuscript analysis.
 * Placeholder: returns alerts derived from chapter status + findings.
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

  const alerts: Array<{
    id: string;
    type: "continuity" | "pacing" | "character" | "style" | "structure";
    severity: "info" | "warning" | "critical";
    title: string;
    detail: string;
    chapterNumber?: number;
  }> = [];

  // Check for very short chapters (potential pacing issues)
  const avgWords = book.chapters.length > 0
    ? book.chapters.reduce((s, c) => s + c.wordCount, 0) / book.chapters.length
    : 0;

  for (const ch of book.chapters) {
    if (avgWords > 0 && ch.wordCount < avgWords * 0.3 && ch.wordCount > 0) {
      alerts.push({
        id: `short-${ch.chapterNumber}`,
        type: "pacing",
        severity: "info",
        title: `Ch.${ch.chapterNumber} is unusually short`,
        detail: `${ch.wordCount.toLocaleString()} words vs ${Math.round(avgWords).toLocaleString()} average`,
        chapterNumber: ch.chapterNumber,
      });
    }

    if (avgWords > 0 && ch.wordCount > avgWords * 2.5) {
      alerts.push({
        id: `long-${ch.chapterNumber}`,
        type: "pacing",
        severity: "info",
        title: `Ch.${ch.chapterNumber} is unusually long`,
        detail: `${ch.wordCount.toLocaleString()} words — consider splitting`,
        chapterNumber: ch.chapterNumber,
      });
    }
  }

  // Check for chapters stuck in the same status for a long time
  const now = Date.now();
  for (const ch of book.chapters) {
    const daysSinceUpdate = Math.floor((now - new Date(ch.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate > 30 && ch.status !== "beta_passed") {
      alerts.push({
        id: `stale-${ch.chapterNumber}`,
        type: "structure",
        severity: "warning",
        title: `Ch.${ch.chapterNumber} unchanged for ${daysSinceUpdate} days`,
        detail: `Status: ${ch.status.replace(/_/g, " ")}`,
        chapterNumber: ch.chapterNumber,
      });
    }
  }

  return NextResponse.json({
    alerts,
    lastAnalyzed: new Date().toISOString(),
    bookHealth: alerts.length === 0 ? "good" : alerts.some(a => a.severity === "critical") ? "critical" : "needs-attention",
  });
}
