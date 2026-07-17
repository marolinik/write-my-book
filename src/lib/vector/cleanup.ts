/**
 * Cleanup operations for the wmb_memory vector collection.
 * Delete, rebuild, and clear operations for book-level memory management.
 */

import { qdrantClient } from "./qdrant-client";
import { indexDocument } from "./indexer";
import { WMB_MEMORY_COLLECTION, type DocType } from "./types";
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents";

// ─── Document Type Mapping ───────────────────────────────────

function mapDocumentType(prismaType: string): DocType {
  switch (prismaType) {
    case "CHAPTER_CONTENT":
    case "CHAPTER_BRIEF":
    case "CHAPTER_PLAN":
      return "chapter";
    case "STORY_BIBLE":
    case "SERIES_BIBLE":
      return "story_bible";
    case "ARCHITECTURE":
    case "SERIES_ARCHITECTURE":
      return "architecture";
    case "FINGERPRINT":
    case "SERIES_FINGERPRINT":
      return "style";
    default:
      return "finding";
  }
}

// ─── Delete Operations ───────────────────────────────────────

/**
 * Delete all chunks for a specific document.
 */
export async function deleteDocumentChunks(
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
    // Ignore errors if collection doesn't exist
  }
}

/**
 * Delete all chunks for a specific chapter (by chapter number).
 * More reliable than docId-based delete since chapters may be indexed
 * via multiple paths (import, agent write, document API) with different docIds.
 */
export async function deleteChapterChunks(
  bookId: string,
  chapterNumber: number
): Promise<void> {
  try {
    await qdrantClient.delete(WMB_MEMORY_COLLECTION, {
      filter: {
        must: [
          { key: "bookId", match: { value: bookId } },
          { key: "chapterNumber", match: { value: chapterNumber } },
        ],
      },
    });
  } catch {
    // Ignore errors if collection doesn't exist
  }
}

/**
 * Delete all chunks for a book.
 */
export async function deleteBookChunks(bookId: string): Promise<void> {
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

// ─── Rebuild Operations ──────────────────────────────────────

/**
 * Rebuild the entire vector index for a book.
 * Deletes all existing chunks, then re-indexes all documents from Postgres.
 */
export async function rebuildBookIndex(
  bookId: string,
  userId: string
): Promise<{ chunksIndexed: number }> {
  // Delete all existing chunks for this book
  await deleteBookChunks(bookId);

  let totalChunks = 0;

  // Load all documents for this book from Postgres
  const documents = await db.document.findMany({
    where: { bookId },
    select: {
      id: true,
      type: true,
      storageKey: true,
      chapterNumber: true,
    },
  });

  // Load chapters for chapter number mapping
  const chapters = await db.chapter.findMany({
    where: { bookId },
    select: { id: true, chapterNumber: true },
  });

  const chapterNumberMap = new Map(
    chapters.map((ch) => [ch.id, ch.chapterNumber])
  );

  // Re-index each document with its ACTUAL content read from storage. The old
  // implementation embedded a `[Document: type] Storage key: …` placeholder
  // instead of the prose (VM2), so vector recall matched metadata, not the
  // manuscript. Read real content via DocumentService.
  const svc = new DocumentService(userId, bookId);

  // We batch by processing up to 5 concurrent documents
  const BATCH_SIZE = 5;
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (doc) => {
        const docType = mapDocumentType(doc.type);
        const chapterNumber = doc.chapterNumber ?? null;

        const stored = await svc.read(doc.id);
        const content = stored?.content ?? "";
        if (!content.trim()) {
          return { chunksIndexed: 0, skipped: true };
        }

        return indexDocument(bookId, docType, doc.id, content, {
          userId,
          chapterNumber,
          version: 1,
        });
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && !result.value.skipped) {
        totalChunks += result.value.chunksIndexed;
      }
    }
  }

  return { chunksIndexed: totalChunks };
}

/**
 * Clear all memory for a book (delete all chunks, no rebuild).
 */
export async function clearBookMemory(bookId: string): Promise<void> {
  await deleteBookChunks(bookId);
}
