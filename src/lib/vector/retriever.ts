/**
 * Unified retrieval: semantic search with payload filtering on wmb_memory.
 * Single searchMemory() replaces three separate search functions.
 */

import { qdrantClient, ensureMemoryCollection } from "./qdrant-client";
import { embedText, isEmbeddingAvailable } from "./embeddings";
import {
  WMB_MEMORY_COLLECTION,
  type SearchFilter,
  type SearchResult,
  type MemoryChunkPayload,
  type DocType,
} from "./types";

// ─── Search Counter (for consistency stats) ──────────────────

let searchCounter = 0;

export function getSearchCount(): number {
  return searchCounter;
}

export function incrementSearchCounter(): void {
  searchCounter++;
}

// ─── Unified Search ──────────────────────────────────────────

/**
 * Search the unified wmb_memory collection.
 * Returns top results with minimum similarity threshold and source attribution.
 */
export async function searchMemory(
  bookId: string,
  query: string,
  options?: {
    docType?: DocType;
    chapterNumber?: number;
    seriesId?: string;
    limit?: number;
    scoreThreshold?: number;
  }
): Promise<SearchResult[]> {
  if (!isEmbeddingAvailable()) return [];

  if (!(await ensureMemoryCollection())) return [];

  const limit = options?.limit ?? 5;
  const scoreThreshold = options?.scoreThreshold ?? 0.75;

  // Embed the query text
  const { vector } = await embedText(query);

  // Build filter conditions
  const filter = buildFilter({
    bookId,
    docType: options?.docType,
    chapterNumber: options?.chapterNumber,
    seriesId: options?.seriesId,
  });

  // Execute search
  const results = await qdrantClient.search(WMB_MEMORY_COLLECTION, {
    vector,
    limit,
    with_payload: true,
    with_vector: false,
    score_threshold: scoreThreshold,
    ...(filter ? { filter } : {}),
  });

  // Increment search counter for stats
  incrementSearchCounter();

  // Map to SearchResult type
  return results.map((point) => ({
    id: String(point.id),
    score: point.score,
    payload: (point.payload ?? {}) as unknown as MemoryChunkPayload,
  }));
}

// ─── Result Formatting ───────────────────────────────────────

/**
 * Format search results into a human-readable text block for prompt injection.
 * Includes source attribution (docType, chapterNumber, score).
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "";

  return results
    .map((r, i) => {
      const p = r.payload;
      const source = [
        p.docType,
        p.chapterNumber !== null ? `Ch.${p.chapterNumber}` : null,
        p.chapterId ? `chunk ${p.chunkIndex}` : null,
      ]
        .filter(Boolean)
        .join(", ");

      const chars =
        p.characterNames.length > 0
          ? ` [characters: ${p.characterNames.join(", ")}]`
          : "";

      return `[${i + 1}] (${source}, score: ${r.score.toFixed(3)})${chars}\n${p.text}`;
    })
    .join("\n\n");
}

// ─── Filter Builder ──────────────────────────────────────────

/**
 * Build a Qdrant filter from our SearchFilter type.
 * Uses `must` conditions for AND-logic filtering.
 */
function buildFilter(
  filter?: SearchFilter
): { must: Array<{ key: string; match: { value: string | number } }> } | undefined {
  if (!filter) return undefined;

  const must: Array<{ key: string; match: { value: string | number } }> = [];

  if (filter.bookId) {
    must.push({ key: "bookId", match: { value: filter.bookId } });
  }
  if (filter.docType) {
    must.push({ key: "docType", match: { value: filter.docType } });
  }
  if (filter.chapterNumber !== undefined) {
    must.push({
      key: "chapterNumber",
      match: { value: filter.chapterNumber },
    });
  }
  if (filter.seriesId) {
    must.push({ key: "seriesId", match: { value: filter.seriesId } });
  }

  // characterNames filter: match on the first character for primary filter
  if (filter.characterNames && filter.characterNames.length > 0) {
    must.push({
      key: "characterNames",
      match: { value: filter.characterNames[0] },
    });
  }

  return must.length > 0 ? { must } : undefined;
}
