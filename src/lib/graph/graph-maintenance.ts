/**
 * Graph maintenance: hooks into document writes to trigger incremental
 * graph updates. Uses content-hash based diffing so unchanged content
 * is skipped entirely.
 */

import { extractEntities, hashContent } from "./entity-extractor";
import type { ExtractionOutcome } from "./entity-extractor";
import { upsertEntities, removeChapterEntities } from "./graph-builder";
import { withSession } from "./neo4j-client";
import type { ExtractionResult } from "./types";
import type { LLMClientOptions } from "@/lib/llm";
import type { ChapterExtractionFacts } from "@/lib/continuity/extraction-status";

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

/**
 * Per-content-version billing cap (RC-4 / D-28 / E1). A chapter whose CURRENT
 * content keeps failing extraction (hard LLM error or suspicious-empty) is
 * re-attempted — and therefore re-billed against the writer's BYOK key — at
 * most this many times. After the cap, `updateFromChapter` returns WITHOUT
 * calling the LLM at all (no tokens spent) until the content changes. Editing
 * the chapter mints a new content hash, which resets the counter and re-enables
 * extraction — so a genuinely fixable chapter always recovers, while a
 * permanently-failing one stops draining the writer's account. The prior
 * behaviour was unbounded: every scan >90s apart re-billed forever.
 */
export const MAX_EMPTY_EXTRACTION_ATTEMPTS = 5;

/**
 * Minimum-yield soft signal (RC-4). Zero-yield on substantive prose is already
 * a HARD failure (see SUSPICIOUS_EMPTY_MIN_WORDS). This catches the OTHER
 * dishonest-green: a large chapter that extraction reduced to almost nothing
 * (a truncated response or a salvaged partial parse) — non-zero, so not
 * "suspicious empty", yet implausibly sparse for its size. At/above
 * LOW_YIELD_MIN_WORDS with total graph items (entities + relationships) at or
 * below LOW_YIELD_MAX_ITEMS we STILL stamp the result (it is not destructive,
 * and real chapters can be entity-sparse), but flag `lowYield` so the writer
 * sees an advisory instead of a silent pass. Deliberately conservative — even a
 * two-hander scene yields both characters plus a relationship — so it does not
 * cry wolf on legitimate prose.
 */
export const LOW_YIELD_MIN_WORDS = 800;
export const LOW_YIELD_MAX_ITEMS = 1;

/**
 * Outcome of an incremental chapter extraction. `updated`/`entitiesFound` are
 * the original contract; the rest make failure and its economics HONEST to the
 * caller (RC-4) instead of collapsing every non-success into a bare
 * `{updated:false}`.
 */
export interface UpdateFromChapterResult {
  updated: boolean;
  entitiesFound: number;
  /**
   * Extraction did NOT yield usable data: either a hard LLM/parse failure
   * (`failed`) or an empty yield on substantive prose (D-31). The content-hash
   * was NOT stamped and the prior graph was left intact — the next scan retries
   * (subject to the billing cap).
   */
  suspiciousEmpty?: boolean;
  /** The LLM call itself threw — distinct from the model running and finding nothing. */
  failed?: boolean;
  /**
   * The billing cap was reached: this content already failed
   * MAX_EMPTY_EXTRACTION_ATTEMPTS times, so extraction was SKIPPED (no LLM call,
   * no tokens billed). Recovery requires a content edit.
   */
  capped?: boolean;
  /** Consecutive failed attempts on the current content (present on failure/cap). */
  attempts?: number;
  /** Succeeded, but the yield was implausibly low for the prose size (advisory). */
  lowYield?: boolean;
}

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
 * The result is not usable and must be treated as a FAILED extraction — either
 * the LLM/parse threw (`failed`, RC-4) or it was a suspicious-empty yield on
 * substantive prose (D-31). A hard failure counts regardless of length: a
 * failure is a failure even on a short chapter, so it must never stamp the hash.
 */
function isFailedOrSuspicious(result: ExtractionOutcome, content: string): boolean {
  return result.failed === true || isSuspiciousEmptyExtraction(result, content);
}

/** Succeeded but implausibly sparse for the prose size (advisory, non-destructive). */
function isLowYield(result: ExtractionOutcome, content: string): boolean {
  return (
    countWords(content) >= LOW_YIELD_MIN_WORDS &&
    result.entities.length + result.relationships.length <= LOW_YIELD_MAX_ITEMS
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
): Promise<UpdateFromChapterResult> {
  if (!content || content.trim().length === 0) {
    return { updated: false, entitiesFound: 0 };
  }

  const newHash = hashContent(content);
  const existingHash = await getContentHash(bookId, chapterNumber);

  // Skip if content hasn't changed
  if (existingHash === newHash) {
    return { updated: false, entitiesFound: 0 };
  }

  // ── Billing cap (RC-4 / D-28) ──
  // Read how many times THIS content has already failed. Once it has hit the
  // cap we STOP here — before any LLM call — so a permanently-failing chapter
  // can never bill more than MAX_EMPTY_EXTRACTION_ATTEMPTS times per content
  // version. A content edit changes newHash, so `lastEmptyHash` no longer
  // matches and extraction is re-enabled (idempotent recovery).
  const emptyState = await getEmptyExtractionState(bookId, chapterNumber);
  const priorAttempts = emptyState.lastEmptyHash === newHash ? emptyState.count : 0;
  if (priorAttempts >= MAX_EMPTY_EXTRACTION_ATTEMPTS) {
    console.warn(
      `[graph-maintenance] EXTRACTION CAPPED for book=${bookId} chapter=${chapterNumber} ` +
        `(${priorAttempts} consecutive empty/failed attempts on unchanged content) — ` +
        `skipping LLM call (NOT billed); edit the chapter to retry (RC-4)`
    );
    return {
      updated: false,
      entitiesFound: 0,
      suspiciousEmpty: true,
      capped: true,
      attempts: priorAttempts,
    };
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

    if (isFailedOrSuspicious(result, content)) {
      // FAILED extraction (RC-4): a hard LLM/parse error (`result.failed`) or an
      // empty yield on substantive prose (D-31). Either way it is NOT a success:
      // do NOT stamp the content-hash (next scan retries), do NOT touch the
      // existing graph, and NEVER report it as clean/green. Record an observable
      // marker (per content version) + bump the Chapter node's updatedAt so the
      // scan route's 90s throttle still spaces retries.
      const attempts = priorAttempts + 1;
      console.warn(
        `[graph-maintenance] ${result.failed ? "FAILED" : "SUSPICIOUS EMPTY"} extraction for ` +
          `book=${bookId} chapter=${chapterNumber} (words=${countWords(content)}, ` +
          `entities=${result.entities.length}, relationships=${result.relationships.length}, ` +
          `attempt=${attempts}/${MAX_EMPTY_EXTRACTION_ATTEMPTS}` +
          `${result.failureReason ? `, reason="${result.failureReason}"` : ""}) — ` +
          `content-hash NOT stamped; will retry on next scan (RC-4/D-31)`
      );
      await markSuspiciousEmptyExtraction(bookId, chapterNumber, newHash);
      return {
        updated: false,
        entitiesFound: 0,
        suspiciousEmpty: true,
        failed: result.failed === true ? true : undefined,
        attempts,
      };
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

    // Store the content hash on the Chapter node for future diffing. This also
    // RESETS the empty-extraction markers (idempotent recovery): a genuine
    // success clears the failing state so a later regression starts a fresh
    // cap window rather than inheriting a stale count.
    const lowYield = isLowYield(result, content);
    await setContentHash(bookId, chapterNumber, newHash, lowYield);

    if (lowYield) {
      console.warn(
        `[graph-maintenance] LOW YIELD extraction for book=${bookId} chapter=${chapterNumber} ` +
          `(words=${countWords(content)}, entities=${result.entities.length}, ` +
          `relationships=${result.relationships.length}) — stamped, but surfaced as an ` +
          `advisory (possible truncated/partial parse, RC-4)`
      );
    }

    return {
      updated: true,
      entitiesFound: result.entities.length,
      lowYield: lowYield ? true : undefined,
    };
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
 *
 * ⚠️ NO BILLING CAP (RC-4 / D-73 E7). Unlike updateFromChapter this path has
 * the honest-failure guard (below) but NOT the per-content-version cap, marker,
 * or throttle: a FAILING bible never stamps a hash (setStoryBibleHash runs only
 * on success) so every invocation on the same unchanged failing content re-runs
 * extractEntities and re-bills the writer's BYOK key, unbounded. This is safe
 * ONLY because this function currently has no live caller (grep-verified — it is
 * dead code this release). DO NOT wire this to any user-triggerable or auto-scan
 * save path without first mirroring the chapter cap: getEmptyExtractionState +
 * markSuspiciousEmptyExtraction keyed on chapterNumber 0 (see D-73 fix). Doing so
 * without the cap silently re-introduces the RC-4 unbounded-rebill leak.
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

    // D-31/RC-4: same poisoned-success mechanism as chapters — a hard LLM
    // failure OR an empty yield on a substantive bible must not stamp the hash,
    // or the canonical entities never enter the graph and no future save of the
    // unchanged bible retries.
    if (isFailedOrSuspicious(result, content)) {
      console.warn(
        `[graph-maintenance] ${result.failed ? "FAILED" : "SUSPICIOUS EMPTY"} extraction for ` +
          `book=${bookId} story bible (words=${countWords(content)}, ` +
          `entities=${result.entities.length}, relationships=${result.relationships.length}` +
          `${result.failureReason ? `, reason="${result.failureReason}"` : ""}) — ` +
          `content-hash NOT stamped; will retry on next save (RC-4/D-31)`
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
 *
 * On a genuine success this also RESETS the empty-extraction markers
 * (`emptyExtractionCount` / `lastEmptyHash` / `lastEmptyExtractionAt`) so the
 * billing cap starts fresh next time — a chapter that recovered must not carry
 * a stale failure count. `lowYield` records whether the successful extraction
 * was implausibly sparse (surfaced later by the read-only status, RC-4).
 */
async function setContentHash(
  bookId: string,
  chapterNumber: number,
  hash: string,
  lowYield: boolean
): Promise<void> {
  await withSession("WRITE", async (session) => {
    await session.run(
      `MERGE (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       ON CREATE SET c.id = randomUUID(), c.name = $name, c.createdAt = datetime()
       SET c.contentHash = $hash, c.updatedAt = datetime(), c.lowYield = $lowYield,
           c.emptyExtractionCount = 0, c.lastEmptyHash = null, c.lastEmptyExtractionAt = null`,
      {
        bookId,
        chapterNumber,
        name: `Chapter ${chapterNumber}`,
        hash,
        lowYield,
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
  chapterNumber: number,
  contentHash: string
): Promise<void> {
  await withSession("WRITE", async (session) => {
    // Per-content-version counter (RC-4 billing cap): increment only while the
    // SAME content keeps failing; reset to 1 when the failing content changed
    // (`lastEmptyHash` mismatch), so the cap window is scoped to one content
    // version and a writer's edit always earns a fresh set of attempts.
    // NB: the failing content hash is bound as `$emptyHash` (NOT `$contentHash`)
    // and stored on `lastEmptyHash` — this marker must never touch the Chapter's
    // `contentHash` property (that is the skip-hash whose absence drives the
    // retry; poisoning it is the D-31 regression this guards against).
    await session.run(
      `MERGE (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       ON CREATE SET c.id = randomUUID(), c.name = $name, c.createdAt = datetime()
       SET c.updatedAt = datetime(),
           c.lastEmptyExtractionAt = datetime(),
           c.emptyExtractionCount = CASE WHEN c.lastEmptyHash = $emptyHash
                                         THEN coalesce(c.emptyExtractionCount, 0) + 1
                                         ELSE 1 END,
           c.lastEmptyHash = $emptyHash`,
      {
        bookId,
        chapterNumber,
        name: `Chapter ${chapterNumber}`,
        emptyHash: contentHash,
      }
    );
  });
}

/**
 * Read the per-content-version empty/failure state off the Chapter node (RC-4).
 * Returns `{count, lastEmptyHash}` — count is how many consecutive empty/failed
 * attempts have been recorded, and lastEmptyHash the content those attempts ran
 * against. Absent node/props degrade to `{count: 0, lastEmptyHash: null}` so a
 * chapter with no failure history is never treated as capped.
 */
async function getEmptyExtractionState(
  bookId: string,
  chapterNumber: number
): Promise<{ count: number; lastEmptyHash: string | null }> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       RETURN c.emptyExtractionCount AS count, c.lastEmptyHash AS lastEmptyHash`,
      { bookId, chapterNumber }
    );
    const rec = result.records[0];
    if (!rec) return { count: 0, lastEmptyHash: null };
    const rawCount = Number(rec.get("count") ?? 0);
    const rawHash = rec.get("lastEmptyHash");
    return {
      count: Number.isFinite(rawCount) ? rawCount : 0,
      lastEmptyHash: typeof rawHash === "string" ? rawHash : null,
    };
  });
}

/**
 * Read the durable extraction facts off the Chapter node for the read-only
 * continuity status (RC-4). Pure fetch — no extraction, no billing. Feeds
 * deriveExtractionStatus so the scan/GET responses can say pending / extracting
 * / failed / checked instead of an ambiguous empty flag list.
 */
export async function getChapterExtractionFacts(
  bookId: string,
  chapterNumber: number
): Promise<ChapterExtractionFacts> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       RETURN c.contentHash AS contentHash,
              c.emptyExtractionCount AS emptyExtractionCount,
              c.lastEmptyExtractionAt AS lastEmptyExtractionAt,
              c.lowYield AS lowYield,
              c.updatedAt AS updatedAt`,
      { bookId, chapterNumber }
    );
    const rec = result.records[0];
    if (!rec) {
      return {
        hasNode: false,
        contentHash: null,
        emptyExtractionCount: 0,
        lastEmptyExtractionAt: null,
        lowYield: false,
        updatedAt: null,
      };
    }
    const toDate = (raw: unknown): Date | null => {
      if (raw === null || raw === undefined) return null;
      const d = new Date(String(raw));
      return isNaN(d.getTime()) ? null : d;
    };
    const contentHash = rec.get("contentHash");
    const rawCount = Number(rec.get("emptyExtractionCount") ?? 0);
    return {
      hasNode: true,
      contentHash: typeof contentHash === "string" ? contentHash : null,
      emptyExtractionCount: Number.isFinite(rawCount) ? rawCount : 0,
      lastEmptyExtractionAt: toDate(rec.get("lastEmptyExtractionAt")),
      lowYield: rec.get("lowYield") === true,
      updatedAt: toDate(rec.get("updatedAt")),
    };
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
