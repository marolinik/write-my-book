/**
 * Graph maintenance: hooks into document writes to trigger incremental
 * graph updates. Uses content-hash based diffing so unchanged content
 * is skipped entirely.
 */

import { extractEntities, hashContent } from "./entity-extractor";
import { upsertEntities, removeChapterEntities } from "./graph-builder";
import { withSession } from "./neo4j-client";
import type { ExtractionResult } from "./types";
import type { LLMClientOptions } from "@/lib/llm";

/**
 * Minimum word count for content to be considered "substantive" (D-31).
 *
 * An extraction returning ZERO entities AND ZERO relationships for content at
 * or above this floor is a "suspicious empty" — real prose always yields at
 * least something, so an empty result there means an LLM/provider flake,
 * truncated response, or parse salvage, and must be treated as a FAILED
 * extraction (no content-hash stamp → the next scan retries). Below the floor
 * (e.g. a 3-word placeholder chapter) an empty result is plausible and is
 * stamped as a normal success so trivial chapters don't re-extract (and
 * re-bill) on every scan forever.
 */
export const SUSPICIOUS_EMPTY_MIN_WORDS = 50;

/** Whitespace-delimited word count; 0 for blank text. */
function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * D-31: an empty yield (no entities AND no relationships) on substantive
 * content is indistinguishable from a genuinely successful extraction unless
 * we check it explicitly — and recording it as success permanently poisons
 * the content-hash skip cache for the chapter.
 */
function isSuspiciousEmptyExtraction(
  result: ExtractionResult,
  content: string
): boolean {
  return (
    result.entities.length === 0 &&
    result.relationships.length === 0 &&
    countWords(content) >= SUSPICIOUS_EMPTY_MIN_WORDS
  );
}

/**
 * Update the knowledge graph from a chapter's content.
 * Compares content hash to the last extraction — if unchanged, skips entirely.
 *
 * @returns Whether the graph was updated and how many entities were found.
 *   `suspiciousEmpty: true` marks a failed-empty extraction (D-31): the hash
 *   was NOT stamped and the next scan will retry.
 */
export async function updateFromChapter(
  bookId: string,
  chapterNumber: number,
  content: string,
  defaultModel?: string,
  keys?: Partial<LLMClientOptions>,
  userId?: string
): Promise<{ updated: boolean; entitiesFound: number; suspiciousEmpty?: boolean }> {
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
    // Run LLM extraction FIRST (D-31): the previous order deleted the
    // chapter's prior graph contribution BEFORE knowing whether extraction
    // yielded anything, so an empty flake (or a hard failure — D-28's
    // never-succeeds case) destroyed data that was never restored.
    // Extraction is a pure LLM call on `content`; it does not read the graph,
    // so running it before the delete is behavior-preserving on success.
    // userId (RC-6) is threaded through so every node/edge is tenant-stamped.
    const result = await extractEntities(content, bookId, chapterNumber, keys, defaultModel, userId);

    if (isSuspiciousEmptyExtraction(result, content)) {
      // D-31: empty yield on substantive prose = FAILED extraction, not
      // success. Do NOT stamp the content-hash (next scan retries), do NOT
      // touch the existing graph. Record an observable marker + bump the
      // Chapter node's updatedAt so the scan route's 90s throttle still
      // spaces the retries (bounded billing — retries only happen on
      // user-triggered scans, never in a loop).
      console.warn(
        `[graph-maintenance] SUSPICIOUS EMPTY extraction for book=${bookId} chapter=${chapterNumber} ` +
          `(words=${countWords(content)}, entities=0, relationships=0) — ` +
          `content-hash NOT stamped; will retry on next scan (D-31)`
      );
      await markSuspiciousEmptyExtraction(bookId, chapterNumber);
      return { updated: false, entitiesFound: 0, suspiciousEmpty: true };
    }

    // Remove stale entities from the previous extraction of this chapter —
    // only now that we know the replacement extraction is usable.
    await removeChapterEntities(bookId, chapterNumber);

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
  content: string,
  defaultModel?: string,
  keys?: Partial<LLMClientOptions>,
  userId?: string
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
    const result = await extractEntities(content, bookId, 0, keys, defaultModel, userId);

    // D-31: same poisoned-success mechanism as chapters — an empty yield on a
    // substantive bible must not stamp the hash, or the canonical entities
    // never enter the graph and no future save of the unchanged bible retries.
    if (isSuspiciousEmptyExtraction(result, content)) {
      console.warn(
        `[graph-maintenance] SUSPICIOUS EMPTY extraction for book=${bookId} story bible ` +
          `(words=${countWords(content)}, entities=0, relationships=0) — ` +
          `content-hash NOT stamped; will retry on next save (D-31)`
      );
      return;
    }

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
 * Record a suspicious-empty extraction on the Chapter node (D-31).
 *
 * Deliberately does NOT touch `contentHash` — the missing stamp is what makes
 * the next scan retry. It DOES bump `updatedAt`, which getChapterNodeUpdatedAt()
 * feeds into the continuity scan's 90s throttle, so failed-empty retries stay
 * time-spaced instead of firing a billed LLM call on every scan click.
 * `lastEmptyExtractionAt` / `emptyExtractionCount` give ops a durable marker
 * for chapters stuck in the retry state.
 */
async function markSuspiciousEmptyExtraction(
  bookId: string,
  chapterNumber: number
): Promise<void> {
  await withSession("WRITE", async (session) => {
    await session.run(
      `MERGE (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       ON CREATE SET c.id = randomUUID(), c.name = $name, c.createdAt = datetime()
       SET c.updatedAt = datetime(),
           c.lastEmptyExtractionAt = datetime(),
           c.emptyExtractionCount = coalesce(c.emptyExtractionCount, 0) + 1`,
      {
        bookId,
        chapterNumber,
        name: `Chapter ${chapterNumber}`,
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
