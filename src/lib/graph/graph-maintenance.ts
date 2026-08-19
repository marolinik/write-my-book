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
 * Hard-failure (transient) cap (D-73 E4). A hard THROW — provider 429/500, a
 * rotated key, a post-spend Neo4j write flake (E6) — is NOT the writer's content
 * being unparseable; it is infrastructure. Feeding those into the content-edit-
 * gated empty cap would pause a perfectly good chapter after 5 outages the
 * writer didn't cause, forcing a pointless prose edit — and a thrown 429 bills
 * ~zero tokens, so it is the CHEAPEST failure class to cap. So hard failures get
 * their OWN counter with a TIME-DECAYING backoff instead: after
 * MAX_FAILED_EXTRACTION_ATTEMPTS rapid throws the auto-retry is withheld for
 * FAILED_BACKOFF_MS, then one probe is allowed. When the provider recovers the
 * probe succeeds and the counter resets — self-healing, no prose edit required.
 */
export const MAX_FAILED_EXTRACTION_ATTEMPTS = 5;
export const FAILED_BACKOFF_MS = 30 * 60 * 1000;

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
  /** Consecutive failed attempts of the RELEVANT kind (present on failure/cap). */
  attempts?: number;
  /**
   * WHICH failure class (D-73 E4): "empty" = unparseable content (edit-gated
   * cap); "failed" = hard throw / post-spend infra flake (backoff-gated cap).
   * Drives how the caller/UI tells the writer to recover.
   */
  failureKind?: "empty" | "failed";
  /** Human-readable reason for a hard failure (from the LLM/infra error). */
  failureReason?: string;
  /**
   * For a backoff-capped hard failure only: epoch-ms after which an auto-retry
   * is eligible again (self-heal). Absent for the edit-gated empty cap.
   */
  retryEligibleAt?: number;
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
  userId?: string,
  now: Date = new Date()
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

  // ── Billing caps (RC-4 / D-73) ── read both failure counters ONCE, before any
  // LLM call, so a capped chapter spends zero tokens.
  const state = await getExtractionState(bookId, chapterNumber);

  // (1) EMPTY cap (D-31, content-edit-gated). Scoped to THIS content version:
  // a content edit changes newHash, so `lastEmptyHash` no longer matches and the
  // attempts reset to 0 — a genuinely fixable chapter always recovers by editing.
  const emptyAttempts = state.lastEmptyHash === newHash ? state.emptyCount : 0;
  if (emptyAttempts >= MAX_EMPTY_EXTRACTION_ATTEMPTS) {
    console.warn(
      `[graph-maintenance] EXTRACTION CAPPED (empty) for book=${bookId} chapter=${chapterNumber} ` +
        `(${emptyAttempts} empty extractions on unchanged content) — ` +
        `skipping LLM call (NOT billed); edit the chapter to retry (D-31/RC-4)`
    );
    return {
      updated: false,
      entitiesFound: 0,
      suspiciousEmpty: true,
      capped: true,
      attempts: emptyAttempts,
      failureKind: "empty",
    };
  }

  // (2) FAILED cap (D-73 E4, time-decaying backoff). A hard-failure streak is
  // infrastructure, not content — so it is NOT edit-gated. After the ceiling we
  // withhold the auto-retry only until the backoff window elapses, then allow one
  // probe (which self-heals once the provider recovers).
  if (
    state.failedCount >= MAX_FAILED_EXTRACTION_ATTEMPTS &&
    state.lastFailedAt !== null &&
    now.getTime() - state.lastFailedAt.getTime() < FAILED_BACKOFF_MS
  ) {
    const retryEligibleAt = state.lastFailedAt.getTime() + FAILED_BACKOFF_MS;
    console.warn(
      `[graph-maintenance] EXTRACTION CAPPED (failed/transient) for book=${bookId} ` +
        `chapter=${chapterNumber} (${state.failedCount} hard failures, backing off) — ` +
        `skipping LLM call (NOT billed); auto-retries after ${new Date(retryEligibleAt).toISOString()} ` +
        `(D-73 E4)`
    );
    return {
      updated: false,
      entitiesFound: 0,
      failed: true,
      suspiciousEmpty: true,
      capped: true,
      attempts: state.failedCount,
      failureKind: "failed",
      failureReason: state.lastFailureReason ?? undefined,
      retryEligibleAt,
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

    // (a) HARD failure (D-73 E4): the LLM/parse threw and entity-extractor
    // surfaced `failed`. This is transient infrastructure — route it to the
    // backoff-gated FAILED counter (NOT the edit-gated empty counter), so a
    // provider outage never forces a prose edit. No hash stamp, no graph touch.
    if (result.failed === true) {
      const reason = result.failureReason ?? "extraction failed";
      const attempts = state.failedCount + 1;
      console.warn(
        `[graph-maintenance] FAILED extraction for book=${bookId} chapter=${chapterNumber} ` +
          `(hard error, attempt=${attempts}, reason="${reason}") — content-hash NOT stamped; ` +
          `backoff-gated retry (D-73 E4)`
      );
      await markFailedExtraction(bookId, chapterNumber, reason);
      return {
        updated: false,
        entitiesFound: 0,
        failed: true,
        suspiciousEmpty: true,
        failureKind: "failed",
        failureReason: reason,
        attempts,
      };
    }

    // (b) SUSPICIOUS EMPTY (D-31): the model ran fine but yielded nothing usable
    // on substantive prose. This is CONTENT the model can't parse — route it to
    // the edit-gated EMPTY counter. No hash stamp, no graph touch; a marker +
    // updatedAt bump keeps the 90s throttle spacing retries.
    if (isSuspiciousEmptyExtraction(result, content)) {
      const attempts = emptyAttempts + 1;
      console.warn(
        `[graph-maintenance] SUSPICIOUS EMPTY extraction for book=${bookId} chapter=${chapterNumber} ` +
          `(words=${countWords(content)}, entities=0, relationships=0, ` +
          `attempt=${attempts}/${MAX_EMPTY_EXTRACTION_ATTEMPTS}) — content-hash NOT stamped; ` +
          `edit-gated retry (D-31)`
      );
      await markSuspiciousEmptyExtraction(bookId, chapterNumber, newHash);
      return {
        updated: false,
        entitiesFound: 0,
        suspiciousEmpty: true,
        failureKind: "empty",
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
    // ── Post-spend infra window (D-73 E6) ──
    // entity-extractor swallows LLM/parse errors into `{failed:true}` (handled
    // above), so a throw that reaches HERE is either the post-extraction writes
    // (removeChapterEntities / upsertEntities / setContentHash) flaking AFTER the
    // tokens were already billed, or a pre-spend createExtractionClient throw
    // (e.g. no API key). Both are hard failures. The pre-fix code returned the
    // skip-shaped `{updated:false, entitiesFound:0}` here — byte-identical to an
    // unchanged-skip — with NO marker and NO cap bump, so during a Neo4j write
    // outage every retry re-extracted and re-billed with no ceiling. Write the
    // FAILED marker (best-effort) so this class counts toward the backoff cap and
    // bumps the throttle, and return an HONEST failed envelope so the route can
    // never report clean.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[graph-maintenance] Failed to update graph for book=${bookId} chapter=${chapterNumber} ` +
        `(post-spend infra window, D-73 E6):`,
      error
    );
    try {
      await markFailedExtraction(bookId, chapterNumber, reason);
    } catch (markError) {
      // Neo4j writes fully down: the durable counter cannot advance this pass. The
      // honest envelope below stops THIS call from reporting clean/skip, but the
      // scan route discards the resolved envelope, so re-bill is NOT bounded in
      // count on a persistent writes-down/reads-up double-fault — only rate-limited
      // by the scan debounce. An absolute ceiling needs an out-of-band marker
      // (Postgres-side) — tracked as D-74. Best-effort only here.
      console.error(
        `[graph-maintenance] could not persist failure marker for book=${bookId} ` +
          `chapter=${chapterNumber} (Neo4j write down?):`,
        markError
      );
    }
    return {
      updated: false,
      entitiesFound: 0,
      failed: true,
      suspiciousEmpty: true,
      failureKind: "failed",
      failureReason: reason,
      attempts: state.failedCount + 1,
    };
  }
}

/**
 * Update the knowledge graph from a story bible document.
 * Story bibles contain canonical entity definitions — we extract them
 * and merge into the graph with chapter=0 to indicate "pre-story" canonical data.
 *
 * BILLING CAP (D-73 E7): mirrors updateFromChapter for chapter 0 — an EMPTY cap
 * (edit-gated) and a hard-FAILURE cap (backoff-gated), both read/marked on the
 * Chapter{bookId,0} node the bible hash already lives on. A permanently-failing
 * bible therefore stops re-billing after the cap instead of re-extracting on
 * every save (the pre-D-73 behaviour, which was only safe because this function
 * had no live caller). Recovery mirrors chapters: edit the bible (empty kind) or
 * wait out the backoff / provider recovery (failed kind).
 */
export async function updateFromStoryBible(
  bookId: string,
  content: string,
  defaultModel?: string,
  keys?: Partial<LLMClientOptions>,
  userId?: string,
  now: Date = new Date()
): Promise<void> {
  if (!content || content.trim().length === 0) {
    return;
  }

  const newHash = hashContent(content);
  const existingHash = await getStoryBibleHash(bookId);

  if (existingHash === newHash) {
    return;
  }

  // ── Billing caps (D-73 E7), keyed on the bible's chapter-0 node ──
  const state = await getExtractionState(bookId, 0);
  const emptyAttempts = state.lastEmptyHash === newHash ? state.emptyCount : 0;
  if (emptyAttempts >= MAX_EMPTY_EXTRACTION_ATTEMPTS) {
    console.warn(
      `[graph-maintenance] STORY BIBLE EXTRACTION CAPPED (empty) for book=${bookId} ` +
        `(${emptyAttempts} empty extractions on unchanged content) — skipping LLM call ` +
        `(NOT billed); edit the bible to retry (D-73 E7)`
    );
    return;
  }
  if (
    state.failedCount >= MAX_FAILED_EXTRACTION_ATTEMPTS &&
    state.lastFailedAt !== null &&
    now.getTime() - state.lastFailedAt.getTime() < FAILED_BACKOFF_MS
  ) {
    console.warn(
      `[graph-maintenance] STORY BIBLE EXTRACTION CAPPED (failed/transient) for book=${bookId} ` +
        `(${state.failedCount} hard failures, backing off) — skipping LLM call (NOT billed) (D-73 E7)`
    );
    return;
  }

  try {
    // Extract using chapter 0 to signify canonical / pre-story data
    const result = await extractEntities(content, bookId, 0, keys, defaultModel, userId);

    // Hard failure (D-73 E4): backoff-gated marker, no stamp.
    if (result.failed === true) {
      const reason = result.failureReason ?? "extraction failed";
      console.warn(
        `[graph-maintenance] FAILED extraction for book=${bookId} story bible ` +
          `(hard error, reason="${reason}") — content-hash NOT stamped; backoff-gated retry (D-73 E7)`
      );
      await markFailedExtraction(bookId, 0, reason);
      return;
    }

    // Suspicious empty (D-31): edit-gated marker, no stamp — else the canonical
    // entities never enter the graph and no future save of the bible retries.
    if (isSuspiciousEmptyExtraction(result, content)) {
      console.warn(
        `[graph-maintenance] SUSPICIOUS EMPTY extraction for book=${bookId} story bible ` +
          `(words=${countWords(content)}, entities=0, relationships=0) — content-hash NOT stamped; ` +
          `edit-gated retry (D-31)`
      );
      await markSuspiciousEmptyExtraction(bookId, 0, newHash);
      return;
    }

    // Inject bookId into all entity properties
    for (const entity of result.entities) {
      entity.properties.bookId = bookId;
    }

    // Upsert (MERGE will update existing nodes, not duplicate them)
    await upsertEntities(result);

    // Store the hash (also clears BOTH failure markers — idempotent recovery)
    await setStoryBibleHash(bookId, newHash);
  } catch (error) {
    // Post-spend infra window (D-73 E6), same as chapters: mark failed so the
    // attempt counts toward the backoff cap; best-effort if Neo4j writes are down.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[graph-maintenance] Failed to update graph from story bible for book=${bookId} ` +
        `(post-spend infra window, D-73 E6):`,
      error
    );
    try {
      await markFailedExtraction(bookId, 0, reason);
    } catch (markError) {
      console.error(
        `[graph-maintenance] could not persist bible failure marker for book=${bookId} ` +
          `(Neo4j write down?):`,
        markError
      );
    }
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
 * On a genuine success this also RESETS BOTH failure markers — the empty-kind
 * (`emptyExtractionCount` / `lastEmptyHash` / `lastEmptyExtractionAt`, D-31) AND
 * the hard-failure kind (`failedExtractionCount` / `lastFailedExtractionAt` /
 * `lastFailureReason`, D-73 E4) — so a chapter that recovered carries no stale
 * failure count of either kind. `lowYield` records whether the successful
 * extraction was implausibly sparse (surfaced later by the read-only status).
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
           c.emptyExtractionCount = 0, c.lastEmptyHash = null, c.lastEmptyExtractionAt = null,
           c.failedExtractionCount = 0, c.lastFailedExtractionAt = null, c.lastFailureReason = null`,
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
 * Record a HARD-failure extraction attempt (D-73 E4/E6): a thrown LLM/parse
 * error, or a post-spend infra flake. Unlike the empty marker this counter is
 * NOT content-scoped — a provider outage is independent of the prose — so it
 * increments unconditionally and is bounded by a time-decaying backoff
 * (FAILED_BACKOFF_MS) rather than a content edit. `lastFailedExtractionAt`
 * anchors that backoff window; `lastFailureReason` (truncated) lets the status
 * view tell the writer "provider was down — retry" vs an empty "edit the prose".
 * Deliberately never touches `contentHash` (its absence drives the retry) nor
 * the empty-kind markers.
 */
async function markFailedExtraction(
  bookId: string,
  chapterNumber: number,
  reason: string
): Promise<void> {
  await withSession("WRITE", async (session) => {
    await session.run(
      `MERGE (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       ON CREATE SET c.id = randomUUID(), c.name = $name, c.createdAt = datetime()
       SET c.updatedAt = datetime(),
           c.lastFailedExtractionAt = datetime(),
           c.failedExtractionCount = coalesce(c.failedExtractionCount, 0) + 1,
           c.lastFailureReason = $reason`,
      {
        bookId,
        chapterNumber,
        name: `Chapter ${chapterNumber}`,
        reason: reason.slice(0, 300),
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
interface ExtractionState {
  /** Suspicious-empty attempts on the current content (D-31, edit-gated). */
  emptyCount: number;
  /** The content hash those empty attempts ran against. */
  lastEmptyHash: string | null;
  /** Hard-failure attempts (D-73 E4, backoff-gated). */
  failedCount: number;
  /** When the last hard failure was recorded — anchors the backoff window. */
  lastFailedAt: Date | null;
  /** Last hard-failure reason (for the capped envelope / status). */
  lastFailureReason: string | null;
}

/**
 * Read BOTH per-chapter failure counters off the Chapter node in one round-trip
 * (D-73 E4). Absent node/props degrade to a zeroed state so a chapter with no
 * failure history is never treated as capped.
 */
async function getExtractionState(
  bookId: string,
  chapterNumber: number
): Promise<ExtractionState> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       RETURN c.emptyExtractionCount AS emptyCount, c.lastEmptyHash AS lastEmptyHash,
              c.failedExtractionCount AS failedCount, c.lastFailedExtractionAt AS lastFailedAt,
              c.lastFailureReason AS lastFailureReason`,
      { bookId, chapterNumber }
    );
    const rec = result.records[0];
    if (!rec) {
      return {
        emptyCount: 0,
        lastEmptyHash: null,
        failedCount: 0,
        lastFailedAt: null,
        lastFailureReason: null,
      };
    }
    const num = (raw: unknown): number => {
      const n = Number(raw ?? 0);
      return Number.isFinite(n) ? n : 0;
    };
    const toDate = (raw: unknown): Date | null => {
      if (raw === null || raw === undefined) return null;
      const d = new Date(String(raw));
      return isNaN(d.getTime()) ? null : d;
    };
    const rawHash = rec.get("lastEmptyHash");
    const rawReason = rec.get("lastFailureReason");
    return {
      emptyCount: num(rec.get("emptyCount")),
      lastEmptyHash: typeof rawHash === "string" ? rawHash : null,
      failedCount: num(rec.get("failedCount")),
      lastFailedAt: toDate(rec.get("lastFailedAt")),
      lastFailureReason: typeof rawReason === "string" ? rawReason : null,
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
              c.failedExtractionCount AS failedExtractionCount,
              c.lastFailedExtractionAt AS lastFailedExtractionAt,
              c.lastFailureReason AS lastFailureReason,
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
        failedExtractionCount: 0,
        lastFailedExtractionAt: null,
        lastFailureReason: null,
        lowYield: false,
        updatedAt: null,
      };
    }
    const toDate = (raw: unknown): Date | null => {
      if (raw === null || raw === undefined) return null;
      const d = new Date(String(raw));
      return isNaN(d.getTime()) ? null : d;
    };
    const num = (raw: unknown): number => {
      const n = Number(raw ?? 0);
      return Number.isFinite(n) ? n : 0;
    };
    const contentHash = rec.get("contentHash");
    const rawReason = rec.get("lastFailureReason");
    return {
      hasNode: true,
      contentHash: typeof contentHash === "string" ? contentHash : null,
      emptyExtractionCount: num(rec.get("emptyExtractionCount")),
      lastEmptyExtractionAt: toDate(rec.get("lastEmptyExtractionAt")),
      failedExtractionCount: num(rec.get("failedExtractionCount")),
      lastFailedExtractionAt: toDate(rec.get("lastFailedExtractionAt")),
      lastFailureReason: typeof rawReason === "string" ? rawReason : null,
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
       ON CREATE SET c.id = randomUUID(), c.name = $name, c.createdAt = datetime()
       SET c.contentHash = $hash, c.updatedAt = datetime(),
           c.emptyExtractionCount = 0, c.lastEmptyHash = null, c.lastEmptyExtractionAt = null,
           c.failedExtractionCount = 0, c.lastFailedExtractionAt = null, c.lastFailureReason = null`,
      {
        bookId,
        name: "Story Bible",
        hash,
      }
    );
  });
}
