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

// ─── Per-User Stats ──────────────────────────────────────────

/** Scroll page size and page cap for the lastIndexed scan (bounds the work). */
const STATS_SCROLL_PAGE = 1000;
const STATS_SCROLL_MAX_PAGES = 50;

type BookScopeFilter = {
  must: { key: "bookId"; match: { any: string[] } }[];
};

/**
 * Memory statistics for ONE writer: only chunks of the books they own.
 *
 * Every tenant shares the single `wmb_memory` collection, so its
 * `points_count` and "first scrolled point" are platform data, not the
 * writer's (P7-S03). Scoped by the caller's own bookIds — every chunk carries
 * its bookId, while legacy chunks may lack a userId.
 */
export async function getUserMemoryStats(bookIds: readonly string[]): Promise<{
  totalChunks: number;
  totalSearches: number;
  lastIndexed: string | null;
}> {
  const empty = { totalChunks: 0, totalSearches: globalSearchCount, lastIndexed: null };
  if (bookIds.length === 0) return empty;

  const filter: BookScopeFilter = {
    must: [{ key: "bookId", match: { any: [...bookIds] } }],
  };

  try {
    const { count } = await qdrantClient.count(WMB_MEMORY_COLLECTION, {
      filter,
      exact: true,
    });
    return {
      totalChunks: count,
      totalSearches: globalSearchCount,
      lastIndexed: count > 0 ? await newestTimestamp(filter) : null,
    };
  } catch {
    return empty;
  }
}

/**
 * The newest `timestamp` among the points matching `filter`. There is no
 * payload index on timestamp to order by, so page through the matches with
 * only that field loaded. Best-effort: a failure yields null.
 */
async function newestTimestamp(filter: BookScopeFilter): Promise<string | null> {
  let newest: string | null = null;
  let offset: string | number | undefined;
  try {
    for (let page = 0; page < STATS_SCROLL_MAX_PAGES; page++) {
      const res = await qdrantClient.scroll(WMB_MEMORY_COLLECTION, {
        filter,
        with_payload: ["timestamp"],
        with_vector: false,
        limit: STATS_SCROLL_PAGE,
        ...(offset !== undefined ? { offset } : {}),
      });
      for (const point of res.points) {
        const ts = (point.payload as Record<string, unknown> | null)?.timestamp;
        if (typeof ts === "string" && (newest === null || ts > newest)) newest = ts;
      }
      const next = res.next_page_offset;
      if (next === null || next === undefined || typeof next === "object") break;
      offset = next;
    }
  } catch {
    // Ignore — the count is still right; the timestamp is a nicety.
  }
  return newest;
}
