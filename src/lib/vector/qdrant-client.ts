/**
 * Qdrant client singleton with collection initialization.
 * Uses globalThis pattern matching Neo4j and Prisma singletons.
 *
 * Single unified collection: wmb_memory
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { WMB_MEMORY_COLLECTION, EMBEDDING_DIMENSIONS } from "./types";

const globalForQdrant = globalThis as unknown as {
  __qdrantClient: QdrantClient | undefined;
};

function createClient(): QdrantClient {
  const url = process.env.QDRANT_URL ?? "http://localhost:6333";
  const apiKey = process.env.QDRANT_API_KEY;

  return new QdrantClient({
    url,
    ...(apiKey ? { apiKey } : {}),
  });
}

export const qdrantClient: QdrantClient =
  globalForQdrant.__qdrantClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForQdrant.__qdrantClient = qdrantClient;
}

/** Old collection names to clean up during migration */
const OLD_COLLECTIONS = [
  "manuscript_chunks",
  "session_summaries",
  "style_patterns",
];

/**
 * Ensure the unified wmb_memory collection exists with correct schema.
 * Safe to call multiple times — skips if collection already exists.
 * Deletes old 3-collection architecture if found.
 */
export async function initVectorCollections(): Promise<void> {
  const existingCollections = await qdrantClient.getCollections();
  const existingNames = new Set(
    existingCollections.collections.map((c) => c.name)
  );

  // Clean up old 3-collection architecture
  for (const oldName of OLD_COLLECTIONS) {
    if (existingNames.has(oldName)) {
      await qdrantClient.deleteCollection(oldName).catch(() => {
        // Ignore errors if collection is already gone
      });
    }
  }

  // Create single unified collection if not exists
  if (!existingNames.has(WMB_MEMORY_COLLECTION)) {
    await qdrantClient.createCollection(WMB_MEMORY_COLLECTION, {
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
    });

    // Create payload indexes for efficient filtering
    await createPayloadIndexes();
  }
}

/**
 * Create payload indexes on the wmb_memory collection for common filter fields.
 */
async function createPayloadIndexes(): Promise<void> {
  await qdrantClient.createPayloadIndex(WMB_MEMORY_COLLECTION, {
    field_name: "bookId",
    field_schema: "keyword",
  });

  await qdrantClient.createPayloadIndex(WMB_MEMORY_COLLECTION, {
    field_name: "seriesId",
    field_schema: "keyword",
  });

  await qdrantClient.createPayloadIndex(WMB_MEMORY_COLLECTION, {
    field_name: "docType",
    field_schema: "keyword",
  });

  await qdrantClient.createPayloadIndex(WMB_MEMORY_COLLECTION, {
    field_name: "chapterNumber",
    field_schema: "integer",
  });

  await qdrantClient.createPayloadIndex(WMB_MEMORY_COLLECTION, {
    field_name: "schemaVersion",
    field_schema: "integer",
  });
}

/**
 * Check Qdrant connectivity.
 */
export async function verifyQdrantConnection(): Promise<boolean> {
  try {
    await qdrantClient.getCollections();
    return true;
  } catch {
    return false;
  }
}
