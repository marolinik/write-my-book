/**
 * Types for the Qdrant vector database integration.
 * Unified single-collection architecture with rich payloads.
 */

// ─── Collection Name ─────────────────────────────────────────

/** Single unified collection for all book memory */
export const WMB_MEMORY_COLLECTION = "wmb_memory" as const;

// ─── Embedding Dimensions ────────────────────────────────────

/** OpenAI text-embedding-3-small produces 1536-dimensional vectors */
export const EMBEDDING_DIMENSIONS = 1536;

// ─── Document Types ──────────────────────────────────────────

export type DocType =
  | "chapter"
  | "story_bible"
  | "architecture"
  | "style"
  | "conversation"
  | "finding"
  | "research";

// ─── Unified Chunk Payload ───────────────────────────────────

export interface MemoryChunkPayload {
  schemaVersion: number; // Always 1
  bookId: string;
  seriesId: string | null;
  docType: string; // DocType union or custom string
  docId: string | null; // Document ID, session ID, or finding ID
  chapterId: string | null;
  chapterNumber: number | null;
  chunkIndex: number;
  text: string;
  characterNames: string[];
  sceneLocation: string | null;
  timestamp: string; // ISO 8601
  language: string | null;
  version: number;
}

// ─── Search Types ────────────────────────────────────────────

export interface SearchOptions {
  query: string;
  limit?: number;
  scoreThreshold?: number;
  filter?: SearchFilter;
}

export interface SearchFilter {
  bookId?: string;
  chapterNumber?: number;
  characterNames?: string[];
  docType?: string;
  seriesId?: string;
}

export interface SearchResult<T = MemoryChunkPayload> {
  id: string;
  score: number;
  payload: T;
}
