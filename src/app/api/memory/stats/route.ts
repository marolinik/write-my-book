import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getBookChunkCounts,
  getUserMemoryStats,
  verifyQdrantConnection,
  getEmbeddingCosts,
} from "@/lib/vector";
import { isProseIndexingPausedForUser } from "@/lib/vector/indexing-gate";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const bookId = request.nextUrl.searchParams.get("bookId");

    if (bookId) {
      // Ownership fence — without this any signed-in user could read another
      // user's book chunk-count / lastIndexed by guessing the bookId (IDOR).
      const owned = await db.book.findFirst({
        where: { id: bookId, userId: user.id },
        select: { id: true },
      });
      if (!owned) {
        return NextResponse.json({ error: "Book not found" }, { status: 404 });
      }

      // Per-book stats
      const [chunkStats, costs, indexingPaused] = await Promise.all([
        getBookChunkCounts(bookId),
        getEmbeddingCosts(user.id, bookId),
        isProseIndexingPausedForUser(user.id),
      ]);

      return NextResponse.json({
        bookId,
        chunkCount: chunkStats.chunkCount,
        lastIndexed: chunkStats.lastIndexed,
        embeddingCost: costs.totalCost,
        embeddingTokens: costs.totalTokens,
        // P1-S06: the Free word cap paused indexing — the card must say so
        // instead of presenting stale memory as current.
        indexingPaused,
      });
    }

    // The caller's own totals (P7-S03): every tenant shares one collection, so
    // its point count and first point are platform data, never the writer's.
    const ownBooks = await db.book.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const [userStats, qdrantHealthy, costs, indexingPaused] = await Promise.all([
      getUserMemoryStats(ownBooks.map((b) => b.id)),
      verifyQdrantConnection(),
      getEmbeddingCosts(user.id),
      isProseIndexingPausedForUser(user.id),
    ]);

    return NextResponse.json({
      totalChunks: userStats.totalChunks,
      totalSearches: userStats.totalSearches,
      lastIndexed: userStats.lastIndexed,
      qdrantHealthy,
      embeddingCost: costs.totalCost,
      embeddingTokens: costs.totalTokens,
      indexingPaused,
    });
  } catch (error) {
    console.error("[memory/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch memory stats" },
      { status: 500 }
    );
  }
}
