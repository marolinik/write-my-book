// ─── Client & Initialization ─────────────────────────────────
export { qdrantClient, initVectorCollections, verifyQdrantConnection } from "./qdrant-client";

// ─── Embeddings ──────────────────────────────────────────────
export { embedText, embedBatch, isEmbeddingAvailable } from "./embeddings";
export type { EmbedResult, EmbedBatchResult } from "./embeddings";

// ─── Types ───────────────────────────────────────────────────
export {
  WMB_MEMORY_COLLECTION,
  EMBEDDING_DIMENSIONS,
  type DocType,
  type MemoryChunkPayload,
  type SearchOptions,
  type SearchFilter,
  type SearchResult,
} from "./types";

// ─── Chunking ────────────────────────────────────────────────
export { chunkChapterContent, stripMarkdown, type ChunkOptions, type TextChunk } from "./chunker";

// ─── Indexing ────────────────────────────────────────────────
export {
  indexDocument,
  scheduleIndex,
  indexBatch,
  cancelPendingIndex,
  deleteBookVectors,
} from "./indexer";

// ─── Retrieval ───────────────────────────────────────────────
export {
  searchMemory,
  formatSearchResults,
  getSearchCount,
} from "./retriever";

// ─── Memory Management ──────────────────────────────────────
export {
  onDocumentChanged,
  onSessionCompleted,
  onFindingsCreated,
  getRelevantMemory,
} from "./memory-manager";

// ─── Cleanup ─────────────────────────────────────────────────
export {
  deleteDocumentChunks,
  deleteBookChunks,
  rebuildBookIndex,
  clearBookMemory,
} from "./cleanup";

// ─── Cost Tracking ───────────────────────────────────────────
export { trackEmbeddingCost, getEmbeddingCosts } from "./cost-tracker";

// ─── Consistency ─────────────────────────────────────────────
export {
  runConsistencyCheck,
  getBookChunkCounts,
  getGlobalMemoryStats,
} from "./consistency";
