import type { StorageAdapter } from "./types";

/** Deletes in flight at once, so a large book neither crawls nor floods S3. */
const DELETE_CONCURRENCY = 16;

export interface PurgeResult {
  deleted: number;
  failed: number;
}

/**
 * Delete every object under a storage adapter's prefix (e.g. a whole book:
 * manuscript, document versions, covers).
 *
 * Per object it is best-effort: one failed delete does not stop the rest, and
 * the failures are counted so the caller can log them. A failed listing
 * throws, because then nothing is known to be gone.
 */
export async function purgeStorage(storage: StorageAdapter): Promise<PurgeResult> {
  const keys = await storage.list();
  const batches = Array.from(
    { length: Math.ceil(keys.length / DELETE_CONCURRENCY) },
    (_, i) => keys.slice(i * DELETE_CONCURRENCY, (i + 1) * DELETE_CONCURRENCY)
  );

  let result: PurgeResult = { deleted: 0, failed: 0 };
  for (const batch of batches) {
    const settled = await Promise.allSettled(batch.map((key) => storage.delete(key)));
    const failed = settled.filter((s) => s.status === "rejected").length;
    result = {
      deleted: result.deleted + settled.length - failed,
      failed: result.failed + failed,
    };
  }
  return result;
}
