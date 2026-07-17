import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { writingGoalSchema, writingStatsQuerySchema } from "@/lib/validation";
import {
  computeStreaks,
  getDailyWordCounts,
  getTodayWords,
} from "@/lib/writing-stats";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

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
    const dailyCounts = await getDailyWordCounts({
      bookId: id,
      days: query.days,
    });

    // Compute streaks
    const { currentStreak, bestStreak } = computeStreaks(dailyCounts);

    // Compute weekly average (last 7 days)
    const last7 = dailyCounts.slice(-7);
    const weeklyTotal = last7.reduce((sum, d) => sum + d.words, 0);
    const weeklyAvg = Math.round(weeklyTotal / 7);

    // Today's words
    const todayWords = getTodayWords(dailyCounts);

    // Get writing goals
    const goals = await db.writingGoal.findMany({
      where: { bookId: id },
    });

    return NextResponse.json({
      dailyCounts,
      todayWords,
      streak: currentStreak,
      bestStreak,
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

    const body = await parseJsonBody(req);
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
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
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
