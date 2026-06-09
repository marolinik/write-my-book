import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/writing-wrapped
 * Returns the user's year-in-writing statistics for the current year.
 */
export async function GET() {
  const user = await requireUser();
  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Aggregate stats
  const [books, sessions, findings] = await Promise.all([
    db.book.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        genre: true,
        wordCount: true,
        chapterCount: true,
        createdAt: true,
      },
    }),
    db.agentSession.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: yearStart, lt: yearEnd },
        status: "completed",
      },
      select: {
        id: true,
        tokensInput: true,
        tokensOutput: true,
        actualCostUsd: true,
        estimatedCostUsd: true,
        startedAt: true,
      },
    }),
    db.editFinding.count({
      where: {
        book: { userId: user.id },
        status: { in: ["applied", "dismissed"] },
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    }),
  ]);

  const totalWords = books.reduce((s, b) => s + b.wordCount, 0);
  const totalChapters = books.reduce((s, b) => s + b.chapterCount, 0);
  const totalSessions = sessions.length;
  const totalAICost = sessions.reduce((s, se) => s + (se.actualCostUsd ?? se.estimatedCostUsd ?? 0), 0);

  // Find top genre
  const genreCounts: Record<string, number> = {};
  for (const b of books) {
    if (b.genre) {
      genreCounts[b.genre] = (genreCounts[b.genre] ?? 0) + 1;
    }
  }
  const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Fiction";

  // Words per month (placeholder — would need document version tracking)
  const wordsPerMonth = Array(12).fill(0);
  const peakMonth = 0;

  // Favorite writing hour (placeholder)
  const sessionHours = sessions.map((s) => new Date(s.startedAt).getHours());
  const hourCounts: Record<number, number> = {};
  for (const h of sessionHours) {
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const favoriteWritingHour = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0]
    ? parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0])
    : 14;

  // Writer personality based on patterns
  const writerPersonality =
    totalSessions > 20 ? "The AI Collaborator" :
    totalWords > 50000 ? "The Prolific Author" :
    totalChapters > 10 ? "The Consistent Creator" :
    "The Emerging Voice";

  return NextResponse.json({
    year,
    totalWords,
    totalChapters,
    totalSessions,
    booksWorkedOn: books.length,
    longestStreak: 0, // Would need daily tracking to compute
    totalDaysWriting: 0,
    favoriteWritingHour,
    topGenre,
    wordsPerMonth,
    peakMonth,
    totalAICost,
    findingsReviewed: findings,
    writerPersonality,
  });
}
