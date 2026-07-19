/**
 * Unified document indexer for the wmb_memory collection.
 * Handles all content types with debounced fire-and-forget scheduling.
 */

import { qdrantClient, ensureMemoryCollection } from "./qdrant-client";
import { embedBatch, isEmbeddingAvailable } from "./embeddings";
import { chunkChapterContent, stripMarkdown } from "./chunker";
import { trackEmbeddingCost } from "./cost-tracker";
import { WMB_MEMORY_COLLECTION, type DocType, type MemoryChunkPayload } from "./types";

// ─── Debounce Map ────────────────────────────────────────────

const indexDebounceMap = new Map<string, NodeJS.Timeout>();

function debounceKey(bookId: string, docType: string, docId: string): string {
  return `${bookId}:${docType}:${docId}`;
}

// ─── Unified Document Indexing ───────────────────────────────

/**
 * Index a document into the wmb_memory collection.
 * Strips markdown, chunks content, embeds, and upserts with rich metadata.
 * Deletes old chunks for the same (bookId, docType, docId) first.
 */
export async function indexDocument(
  bookId: string,
  docType: DocType,
  docId: string,
  content: string,
  metadata: {
    userId?: string;
    seriesId?: string | null;
    chapterId?: string | null;
    chapterNumber?: number | null;
    language?: string | null;
    version?: number;
  } = {}
): Promise<{ chunksIndexed: number; skipped: boolean }> {
  if (!isEmbeddingAvailable()) {
    return { chunksIndexed: 0, skipped: true };
  }

  if (!(await ensureMemoryCollection())) {
    return { chunksIndexed: 0, skipped: true };
  }

  if (!content || content.trim().length === 0) {
    return { chunksIndexed: 0, skipped: true };
  }

  // Strip markdown for cleaner embeddings
  const strippedContent = stripMarkdown(content);

  if (strippedContent.trim().length === 0) {
    return { chunksIndexed: 0, skipped: true };
  }

  // Chunk the content (reusing scene-aware chunker)
  const chunks = chunkChapterContent(
    strippedContent,
    bookId,
    metadata.chapterNumber ?? 0,
    { maxTokens: 400, overlapTokens: 50 }
  );

  if (chunks.length === 0) {
    return { chunksIndexed: 0, skipped: true };
  }

  // Delete old chunks for this document
  await deleteChunksForDocument(bookId, docType, docId);

  // Embed all chunks in batch
  const texts = chunks.map((c) => c.text);
  const { vectors, tokensUsed } = await embedBatch(texts);

  // Build points with unified MemoryChunkPayload
  const now = new Date().toISOString();
  const points = chunks.map((chunk, i) => {
    const payload: MemoryChunkPayload = {
      schemaVersion: 1,
      bookId,
      userId: metadata.userId ?? null,
      seriesId: metadata.seriesId ?? null,
      docType,
      docId,
      chapterId: metadata.chapterId ?? null,
      chapterNumber: metadata.chapterNumber ?? null,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      characterNames: chunk.charactersMentioned,
      sceneLocation: null,
      timestamp: now,
      language: metadata.language ?? null,
      version: metadata.version ?? 1,
    };

    return {
      id: crypto.randomUUID(),
      vector: vectors[i],
      payload: payload as unknown as Record<string, unknown>,
    };
  });

  // Upsert into Qdrant
  await qdrantClient.upsert(WMB_MEMORY_COLLECTION, {
    points,
    wait: true,
  });

  // Track embedding cost (fire-and-forget)
  if (metadata.userId && tokensUsed > 0) {
    trackEmbeddingCost(metadata.userId, bookId, tokensUsed).catch(() => {
      // Silently ignore cost tracking failures
    });
  }

  return { chunksIndexed: chunks.length, skipped: false };
}

// ─── Debounced Scheduling ────────────────────────────────────

/**
 * Schedule a document index with debounce.
 * If called again within debounceMs for the same document, the previous
 * timer is canceled. Useful for rapid-save scenarios.
 */
export function scheduleIndex(
  bookId: string,
  docType: DocType,
  docId: string,
  content: string,
  metadata: {
    userId?: string;
    seriesId?: string | null;
    chapterId?: string | null;
    chapterNumber?: number | null;
    language?: string | null;
    version?: number;
  } = {},
  debounceMs = 2000
): void {
  const key = debounceKey(bookId, docType, docId);

  // Cancel any pending index for this document
  const existing = indexDebounceMap.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  // Schedule new index
  const timeout = setTimeout(() => {
    indexDebounceMap.delete(key);
    indexDocument(bookId, docType, docId, content, metadata).catch((err) => {
      console.error(`[indexer] Debounced index failed for ${key}:`, err);
    });
  }, debounceMs);

  indexDebounceMap.set(key, timeout);
}

/**
 * Cancel a pending debounced index for a specific document.
 */
export function cancelPendingIndex(
  bookId: string,
  docType: string,
  docId: string
): void {
  const key = debounceKey(bookId, docType, docId);
  const existing = indexDebounceMap.get(key);
  if (existing) {
    clearTimeout(existing);
    indexDebounceMap.delete(key);
  }
}

// ─── Batch Indexing ──────────────────────────────────────────

/**
 * Index multiple documents in batches (useful for import).
 * Processes up to 5 concurrently using Promise.allSettled.
 */
export async function indexBatch(
  items: Array<{
    bookId: string;
    docType: DocType;
    docId: string;
    content: string;
    metadata?: {
      userId?: string;
      seriesId?: string | null;
      chapterId?: string | null;
      chapterNumber?: number | null;
      language?: string | null;
      version?: number;
    };
  }>
): Promise<{
  indexed: number;
  skipped: number;
  failed: number;
}> {
  const BATCH_SIZE = 5;
  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((item) =>
        indexDocument(
          item.bookId,
          item.docType,
          item.docId,
          item.content,
          item.metadata ?? {}
        )
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value.skipped) {
          skipped++;
        } else {
          indexed++;
        }
      } else {
        failed++;
      }
    }
  }

  return { indexed, skipped, failed };
}

// ─── Cleanup ─────────────────────────────────────────────────

/**
 * Delete chunks for a specific document within the unified collection.
 */
async function deleteChunksForDocument(
  bookId: string,
  docType: string,
  docId: string
): Promise<void> {
  try {
    await qdrantClient.delete(WMB_MEMORY_COLLECTION, {
      filter: {
        must: [
          { key: "bookId", match: { value: bookId } },
          { key: "docType", match: { value: docType } },
          { key: "docId", match: { value: docId } },
        ],
      },
    });
  } catch {
    // Ignore errors if collection doesn't exist yet
  }
}

/**
 * Delete all vectors for a book across the unified collection.
 */
export async function deleteBookVectors(bookId: string): Promise<void> {
  try {
    await qdrantClient.delete(WMB_MEMORY_COLLECTION, {
      filter: {
        must: [{ key: "bookId", match: { value: bookId } }],
      },
    });
  } catch {
    // Ignore errors if collection doesn't exist
  }
}
