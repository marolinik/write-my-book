import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { writingGoalSchema, writingStatsQuerySchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Compute daily word counts from DocumentVersion records.
 * We look at CHAPTER_CONTENT document versions and compute the word count
 * diff between consecutive versions per day. For the first version of each
 * document, the entire word count is attributed to its creation date.
 */
async function getDailyWordCounts(bookId: string, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get all document versions for CHAPTER_CONTENT docs belonging to this book
  const versions = await db.documentVersion.findMany({
    where: {
      document: {
        bookId,
        type: "CHAPTER_CONTENT",
      },
      createdAt: { gte: since },
    },
    select: {
      documentId: true,
      version: true,
      wordCount: true,
      createdAt: true,
    },
    orderBy: [{ documentId: "asc" }, { version: "asc" }],
  });

  // For each version, compute the word count delta
  const dailyMap = new Map<string, number>();

  // Initialize all days in range
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, 0);
  }

  // Group by document to compute deltas
  const byDoc = new Map<string, typeof versions>();
  for (const v of versions) {
    const existing = byDoc.get(v.documentId) ?? [];
    existing.push(v);
    byDoc.set(v.documentId, existing);
  }

  for (const [, docVersions] of byDoc) {
    for (let i = 0; i < docVersions.length; i++) {
      const v = docVersions[i];
      const prevWordCount = i > 0 ? docVersions[i - 1].wordCount : 0;
      const delta = Math.max(0, v.wordCount - prevWordCount);
      const dateKey = v.createdAt.toISOString().split("T")[0];

      if (dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + delta);
      }
    }
  }

  // Convert to sorted array (oldest first)
  return Array.from(dailyMap.entries())
    .map(([date, words]) => ({ date, words }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compute writing streak: consecutive days (ending today or yesterday)
 * with at least 1 word written.
 */
function computeStreak(dailyCounts: Array<{ date: string; words: number }>): number {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Work backwards from most recent
  const sorted = [...dailyCounts].sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  let expectedDate = today;

  for (const entry of sorted) {
    if (entry.date === expectedDate) {
      if (entry.words > 0) {
        streak++;
        // Move expected date back one day
        const d = new Date(expectedDate);
        d.setDate(d.getDate() - 1);
        expectedDate = d.toISOString().split("T")[0];
      } else {
        // If today has 0 words, allow starting from yesterday
        if (entry.date === today) {
          expectedDate = yesterday;
          continue;
        }
        break;
      }
    } else if (entry.date < expectedDate) {
      // Skip if we missed a day (streak broken), unless it's because
      // today hasn't started yet and we're looking at yesterday
      if (streak === 0 && entry.date === yesterday && entry.words > 0) {
        streak++;
        const d = new Date(yesterday);
        d.setDate(d.getDate() - 1);
        expectedDate = d.toISOString().split("T")[0];
      } else {
        break;
      }
    }
  }

  return streak;
}

/** GET /api/books/:id/writing-stats */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id, userId: user.id },
      select: { id: true, wordCount: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Parse query params
    const url = new URL(req.url);
    const query = writingStatsQuerySchema.parse({
      days: url.searchParams.get("days") ?? undefined,
    });

    // Compute total words as sum of all chapter word counts (avoids drift from denormalized book.wordCount)
    const allChapters = await db.chapter.findMany({
      where: { bookId: id },
      select: { wordCount: true },
    });
    const totalWords = allChapters.reduce((sum, ch) => sum + ch.wordCount, 0);

    // Get daily word counts
    const dailyCounts = await getDailyWordCounts(id, query.days);

    // Compute streak
    const streak = computeStreak(dailyCounts);

    // Compute weekly average (last 7 days)
    const last7 = dailyCounts.slice(-7);
    const weeklyTotal = last7.reduce((sum, d) => sum + d.words, 0);
    const weeklyAvg = Math.round(weeklyTotal / 7);

    // Today's words
    const today = new Date().toISOString().split("T")[0];
    const todayEntry = dailyCounts.find((d) => d.date === today);
    const todayWords = todayEntry?.words ?? 0;

    // Get writing goals
    const goals = await db.writingGoal.findMany({
      where: { bookId: id },
    });

    return NextResponse.json({
      dailyCounts,
      todayWords,
      streak,
      weeklyAvg,
      totalWords,
      goals,
    });
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
    console.error("GET /api/books/:id/writing-stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch writing stats" },
      { status: 500 }
    );
  }
}

/** POST /api/books/:id/writing-stats — create or update a writing goal */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    // Verify book ownership
    const book = await db.book.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const body = await req.json();
    const data = writingGoalSchema.parse(body);

    // Upsert the goal (one per type per book)
    const goal = await db.writingGoal.upsert({
      where: {
        bookId_type: { bookId: id, type: data.type },
      },
      update: { target: data.target },
      create: {
        bookId: id,
        type: data.type,
        target: data.target,
      },
    });

    return NextResponse.json(goal);
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
    console.error("POST /api/books/:id/writing-stats error:", error);
    return NextResponse.json(
      { error: "Failed to save writing goal" },
      { status: 500 }
    );
  }
}
