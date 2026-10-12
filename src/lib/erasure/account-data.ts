import { deleteBookChunks } from "@/lib/vector";
import { clearBookGraph } from "@/lib/graph";
import { getStorage } from "@/lib/storage";
import { purgeStorage } from "@/lib/storage/purge";
import { logger } from "@/lib/logger";

export interface AccountErasureTarget {
  /** The internal user id: every stored object lives under `${userId}/`. */
  userId: string;
  bookIds: readonly string[];
}

/**
 * Remove a deleted account's data from the stores Postgres does not cascade
 * into: memory chunks (Qdrant), the story graph (Neo4j) and every stored object
 * under the user's prefix (S3/MinIO). Run after the rows are gone.
 *
 * Best-effort per store: a fault is logged for the operator and never stops
 * the other stores, so one outage does not keep the rest of the data alive.
 */
export async function eraseAccountData(target: AccountErasureTarget): Promise<void> {
  if (!target.userId) {
    // An empty prefix is the whole bucket.
    logger.error("eraseAccountData: refused an empty user id");
    return;
  }

  for (const bookId of target.bookIds) {
    await attempt(`chunks of book ${bookId}`, () => deleteBookChunks(bookId));
    await attempt(`graph of book ${bookId}`, () => clearBookGraph(bookId));
  }

  await attempt(`stored files of user ${target.userId}`, async () => {
    const { failed } = await purgeStorage(getStorage(target.userId));
    if (failed > 0) {
      throw new Error(`${failed} stored object(s) could not be removed`);
    }
  });
}

async function attempt(what: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logger.error(`eraseAccountData: ${what} not removed`, error);
  }
}
