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
    checkCompatibility: false,
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

  await createMemoryCollection(existingNames);
}

/**
 * Create the unified collection (with payload indexes) if it does not exist.
 * Creation only — never deletes legacy collections.
 */
async function createMemoryCollection(
  existingNames: ReadonlySet<string>
): Promise<void> {
  if (existingNames.has(WMB_MEMORY_COLLECTION)) return;

  try {
    await qdrantClient.createCollection(WMB_MEMORY_COLLECTION, {
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: "Cosine",
      },
      optimizers_config: {
        default_segment_number: 2,
      },
    });
  } catch (err: unknown) {
    // Another process (Next server vs BullMQ worker) may have created the
    // collection between our existence check and this call. A lost create
    // race is success, not failure — treating it as failure would put this
    // process in a 60s vector blackout. ApiError carries the conflict in
    // .status; older Qdrant versions return 400 with "already exists" in .data.
    const e = err as { status?: number; data?: unknown };
    const alreadyExists =
      e.status === 409 || /already exists/i.test(JSON.stringify(e.data ?? ""));
    if (!alreadyExists) throw err;
  }

  // Idempotent — safe to run even when the create was a swallowed conflict
  await createPayloadIndexes();
}

let ensurePromise: Promise<boolean> | null = null;
let lastFailureAt = 0;
const FAILURE_RETRY_MS = 60_000;

/**
 * Lazily ensure the wmb_memory collection exists before any read/write.
 * Memoized on success; failures are cached for 60s to avoid hammering a
 * down Qdrant instance. Creation-only — legacy cleanup stays in
 * initVectorCollections (explicit admin path).
 */
export async function ensureMemoryCollection(): Promise<boolean> {
  if (ensurePromise) return ensurePromise;
  if (Date.now() - lastFailureAt < FAILURE_RETRY_MS) return false;

  ensurePromise = qdrantClient
    .getCollections()
    .then(async (existing) => {
      const names = new Set(existing.collections.map((c) => c.name));
      await createMemoryCollection(names);
      return true;
    })
    .catch((err: unknown) => {
      console.error(
        "[qdrant] ensureMemoryCollection failed:",
        err instanceof Error ? err.message : err
      );
      lastFailureAt = Date.now();
      ensurePromise = null;
      return false;
    });

  return ensurePromise;
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
