import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeStreaks, getDailyWordCounts } from "@/lib/writing-stats";

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

  // Real daily word deltas, scoped to the labeled calendar year (UTC-bucketed).
  // Sessions/findings above are year-filtered; word stats must match or the
  // monthly chart folds two different years into one deck.
  const dailyCounts = (
    await getDailyWordCounts({ userId: user.id, days: 365 })
  ).filter((d) => d.date >= `${year}-01-01`);
  const { bestStreak, activeDays } = computeStreaks(dailyCounts);

  // Words per month: bucket daily deltas into 12 month slots
  const wordsPerMonth: number[] = Array(12).fill(0);
  for (const day of dailyCounts) {
    const monthIndex = parseInt(day.date.slice(5, 7), 10) - 1;
    wordsPerMonth[monthIndex] += day.words;
  }
  const peakMonth = wordsPerMonth.indexOf(Math.max(...wordsPerMonth));

  // Favorite writing hour, derived from agent sessions (null when no sessions)
  const hourCounts: Record<number, number> = {};
  for (const s of sessions) {
    const h = new Date(s.startedAt).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const topHourEntry = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  const favoriteWritingHour: number | null = topHourEntry
    ? parseInt(topHourEntry[0], 10)
    : null;

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
    longestStreak: bestStreak,
    totalDaysWriting: activeDays,
    favoriteWritingHour,
    topGenre,
    wordsPerMonth,
    peakMonth,
    totalAICost,
    findingsReviewed: findings,
    writerPersonality,
  });
}
