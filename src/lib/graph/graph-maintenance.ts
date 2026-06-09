/**
 * Graph maintenance: hooks into document writes to trigger incremental
 * graph updates. Uses content-hash based diffing so unchanged content
 * is skipped entirely.
 */

import { extractEntities, hashContent } from "./entity-extractor";
import { upsertEntities, removeChapterEntities } from "./graph-builder";
import { withSession } from "./neo4j-client";

/**
 * Update the knowledge graph from a chapter's content.
 * Compares content hash to the last extraction — if unchanged, skips entirely.
 *
 * @returns Whether the graph was updated and how many entities were found.
 */
export async function updateFromChapter(
  bookId: string,
  chapterNumber: number,
  content: string
): Promise<{ updated: boolean; entitiesFound: number }> {
  if (!content || content.trim().length === 0) {
    return { updated: false, entitiesFound: 0 };
  }

  const newHash = hashContent(content);
  const existingHash = await getContentHash(bookId, chapterNumber);

  // Skip if content hasn't changed
  if (existingHash === newHash) {
    return { updated: false, entitiesFound: 0 };
  }

  try {
    // Remove stale entities from previous extraction of this chapter
    await removeChapterEntities(bookId, chapterNumber);

    // Run LLM extraction
    const result = await extractEntities(content, bookId, chapterNumber);

    // Inject bookId into all entity properties so MERGE works correctly
    for (const entity of result.entities) {
      entity.properties.bookId = bookId;
    }

    // Upsert into Neo4j
    await upsertEntities(result);

    // Store the content hash on the Chapter node for future diffing
    await setContentHash(bookId, chapterNumber, newHash);

    return { updated: true, entitiesFound: result.entities.length };
  } catch (error) {
    console.error(
      `[graph-maintenance] Failed to update graph for book=${bookId} chapter=${chapterNumber}:`,
      error
    );
    // Return gracefully — graph updates are non-critical
    return { updated: false, entitiesFound: 0 };
  }
}

/**
 * Update the knowledge graph from a story bible document.
 * Story bibles contain canonical entity definitions — we extract them
 * and merge into the graph with chapter=0 to indicate "pre-story" canonical data.
 */
export async function updateFromStoryBible(
  bookId: string,
  content: string
): Promise<void> {
  if (!content || content.trim().length === 0) {
    return;
  }

  const newHash = hashContent(content);
  const existingHash = await getStoryBibleHash(bookId);

  if (existingHash === newHash) {
    return;
  }

  try {
    // Extract using chapter 0 to signify canonical / pre-story data
    const result = await extractEntities(content, bookId, 0);

    // Inject bookId into all entity properties
    for (const entity of result.entities) {
      entity.properties.bookId = bookId;
    }

    // Upsert (MERGE will update existing nodes, not duplicate them)
    await upsertEntities(result);

    // Store the hash on a special meta node
    await setStoryBibleHash(bookId, newHash);
  } catch (error) {
    console.error(
      `[graph-maintenance] Failed to update graph from story bible for book=${bookId}:`,
      error
    );
  }
}

/**
 * Get the content hash stored on a Chapter node for a given chapter.
 * Returns null if no hash is stored (chapter has never been extracted).
 */
export async function getContentHash(
  bookId: string,
  chapterNumber: number
): Promise<string | null> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       RETURN c.contentHash AS hash`,
      { bookId, chapterNumber }
    );
    if (result.records.length === 0) {
      return null;
    }
    const hash = result.records[0].get("hash");
    return typeof hash === "string" ? hash : null;
  });
}

/**
 * Store the content hash on a Chapter node (MERGE to create if needed).
 */
async function setContentHash(
  bookId: string,
  chapterNumber: number,
  hash: string
): Promise<void> {
  await withSession("WRITE", async (session) => {
    await session.run(
      `MERGE (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       ON CREATE SET c.id = randomUUID(), c.name = $name, c.contentHash = $hash,
                     c.createdAt = datetime(), c.updatedAt = datetime()
       ON MATCH SET c.contentHash = $hash, c.updatedAt = datetime()`,
      {
        bookId,
        chapterNumber,
        name: `Chapter ${chapterNumber}`,
        hash,
      }
    );
  });
}

/**
 * Get the story bible content hash (stored on a meta node).
 */
async function getStoryBibleHash(bookId: string): Promise<string | null> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Chapter {bookId: $bookId, chapterNumber: 0})
       RETURN c.contentHash AS hash`,
      { bookId }
    );
    if (result.records.length === 0) {
      return null;
    }
    const hash = result.records[0].get("hash");
    return typeof hash === "string" ? hash : null;
  });
}

/**
 * Store the story bible content hash on a Chapter node with chapterNumber=0.
 */
async function setStoryBibleHash(
  bookId: string,
  hash: string
): Promise<void> {
  await withSession("WRITE", async (session) => {
    await session.run(
      `MERGE (c:Chapter {bookId: $bookId, chapterNumber: 0})
       ON CREATE SET c.id = randomUUID(), c.name = $name, c.contentHash = $hash,
                     c.createdAt = datetime(), c.updatedAt = datetime()
       ON MATCH SET c.contentHash = $hash, c.updatedAt = datetime()`,
      {
        bookId,
        name: "Story Bible",
        hash,
      }
    );
  });
}
