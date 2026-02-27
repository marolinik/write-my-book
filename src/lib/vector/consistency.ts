/**
 * Consistency checking between Postgres documents and Qdrant vector chunks.
 * Compares expected document counts with actual chunk counts.
 */

import { qdrantClient } from "./qdrant-client";
import { WMB_MEMORY_COLLECTION } from "./types";
import { db } from "@/lib/db";

// ─── Global Stats ────────────────────────────────────────────

let globalSearchCount = 0;

export function incrementSearchCounter(): void {
  globalSearchCount++;
}

// ─── Book-Level Checks ──────────────────────────────────────

/**
 * Get the chunk count and last indexed time for a book in Qdrant.
 */
export async function getBookChunkCounts(
  bookId: string
): Promise<{ chunkCount: number; lastIndexed: string | null }> {
  try {
    const result = await qdrantClient.scroll(WMB_MEMORY_COLLECTION, {
      filter: {
        must: [{ key: "bookId", match: { value: bookId } }],
      },
      with_payload: ["timestamp"],
      with_vector: false,
      limit: 1000,
    });

    const chunkCount = result.points.length;
    let lastIndexed: string | null = null;

    if (chunkCount > 0) {
      // Find the most recent timestamp
      const timestamps = result.points
        .map((p) => (p.payload as Record<string, unknown>)?.timestamp as string)
        .filter(Boolean)
        .sort()
        .reverse();

      lastIndexed = timestamps[0] ?? null;
    }

    return { chunkCount, lastIndexed };
  } catch {
    return { chunkCount: 0, lastIndexed: null };
  }
}

/**
 * Run a consistency check comparing Postgres document count vs Qdrant chunk count.
 * Returns whether the counts are "consistent" — Qdrant should have chunks for
 * every document that has content.
 */
export async function runConsistencyCheck(
  bookId: string
): Promise<{
  expected: number;
  actual: number;
  isConsistent: boolean;
}> {
  // Count documents in Postgres that should have vector chunks
  const documentCount = await db.document.count({
    where: {
      bookId,
      // Only count document types that are indexable
      type: {
        in: [
          "CHAPTER_CONTENT",
          "CHAPTER_BRIEF",
          "CHAPTER_PLAN",
          "STORY_BIBLE",
          "ARCHITECTURE",
          "FINGERPRINT",
          "DEV_EDIT_REPORT",
          "LINE_EDIT_REPORT",
          "BETA_READ_REPORT",
          "CONTINUITY_REPORT",
          "ANALYSIS_REPORT",
          "MARKET_REPORT",
        ],
      },
    },
  });

  // Count unique docIds in Qdrant for this book
  const { chunkCount } = await getBookChunkCounts(bookId);

  // Consistency check: we expect at least one chunk per document
  // (a document with content should produce at least 1 chunk)
  const isConsistent = chunkCount >= documentCount;

  return {
    expected: documentCount,
    actual: chunkCount,
    isConsistent,
  };
}

// ─── Global Stats ────────────────────────────────────────────

/**
 * Get global memory statistics across all books.
 */
export async function getGlobalMemoryStats(): Promise<{
  totalChunks: number;
  totalSearches: number;
  lastIndexed: string | null;
}> {
  try {
    const collectionInfo = await qdrantClient.getCollection(
      WMB_MEMORY_COLLECTION
    );

    const totalChunks = collectionInfo.points_count ?? 0;

    // Get last indexed timestamp by scrolling recent points
    let lastIndexed: string | null = null;
    try {
      const recent = await qdrantClient.scroll(WMB_MEMORY_COLLECTION, {
        with_payload: ["timestamp"],
        with_vector: false,
        limit: 1,
        // Qdrant returns points in insertion order by default
      });

      if (recent.points.length > 0) {
        lastIndexed =
          ((recent.points[0].payload as Record<string, unknown>)
            ?.timestamp as string) ?? null;
      }
    } catch {
      // Ignore
    }

    return {
      totalChunks,
      totalSearches: globalSearchCount,
      lastIndexed,
    };
  } catch {
    return {
      totalChunks: 0,
      totalSearches: globalSearchCount,
      lastIndexed: null,
    };
  }
}
