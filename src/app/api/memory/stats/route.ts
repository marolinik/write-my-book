import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getBookChunkCounts,
  getGlobalMemoryStats,
  verifyQdrantConnection,
  getEmbeddingCosts,
} from "@/lib/vector";

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
      const [chunkStats, costs] = await Promise.all([
        getBookChunkCounts(bookId),
        getEmbeddingCosts(user.id, bookId),
      ]);

      return NextResponse.json({
        bookId,
        chunkCount: chunkStats.chunkCount,
        lastIndexed: chunkStats.lastIndexed,
        embeddingCost: costs.totalCost,
        embeddingTokens: costs.totalTokens,
      });
    }

    // Global stats
    const [globalStats, qdrantHealthy, costs] = await Promise.all([
      getGlobalMemoryStats(),
      verifyQdrantConnection(),
      getEmbeddingCosts(user.id),
    ]);

    return NextResponse.json({
      totalChunks: globalStats.totalChunks,
      totalSearches: globalStats.totalSearches,
      lastIndexed: globalStats.lastIndexed,
      qdrantHealthy,
      embeddingCost: costs.totalCost,
      embeddingTokens: costs.totalTokens,
    });
  } catch (error) {
    console.error("[memory/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch memory stats" },
      { status: 500 }
    );
  }
}
