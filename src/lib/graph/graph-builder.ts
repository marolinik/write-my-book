/**
 * Graph builder: takes extracted entities and MERGE-upserts them into Neo4j.
 * Incremental: uses content hashes to skip unchanged sections.
 * Handles renames via alias tracking.
 */

import { withSession } from "./neo4j-client";
import { RELATIONSHIP_TYPES } from "./types";
import type {
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  GraphNodeLabel,
} from "./types";

interface UpsertStats {
  nodesCreated: number;
  nodesUpdated: number;
  relationshipsCreated: number;
}

/**
 * Upsert all entities and relationships from an extraction result into Neo4j.
 * Uses MERGE on (bookId, name) for each entity so repeated runs are idempotent.
 */
export async function upsertEntities(
  result: ExtractionResult
): Promise<UpsertStats> {
  const stats: UpsertStats = {
    nodesCreated: 0,
    nodesUpdated: 0,
    relationshipsCreated: 0,
  };

  if (result.entities.length === 0 && result.relationships.length === 0) {
    return stats;
  }

  // D-30 guard: every graph write MUST be scoped to the calling book. The type
  // requires bookId, but a legacy/buggy caller could still pass an empty value
  // at runtime — refuse loudly rather than write unscoped (or, worse, let a
  // name-only MATCH touch other books' graphs).
  if (!result.bookId) {
    console.error(
      "[graph-builder] upsertEntities called without bookId — refusing to write unscoped graph data (D-30)"
    );
    return stats;
  }

  await withSession("WRITE", async (session) => {
    // Pass 1: Upsert all entities
    for (const entity of result.entities) {
      const entityStats = await upsertSingleEntity(
        session,
        entity,
        result.bookId,
        result.chapterNumber,
        result.contentHash,
        result.userId
      );
      stats.nodesCreated += entityStats.created;
      stats.nodesUpdated += entityStats.updated;
    }

    // Pass 2: Create all relationships
    for (const rel of result.relationships) {
      const created = await upsertRelationship(
        session,
        rel,
        result.bookId,
        result.chapterNumber,
        result.userId
      );
      if (created) {
        stats.relationshipsCreated += 1;
      }
    }
  });

  return stats;
}

/**
 * Upsert a single entity node. First checks aliases to find existing nodes
 * that may have been renamed, then does a MERGE on (bookId, name).
 */
async function upsertSingleEntity(
  session: import("neo4j-driver").Session,
  entity: ExtractedEntity,
  bookId: string,
  chapterNumber: number,
  contentHash: string,
  userId?: string
): Promise<{ created: number; updated: number }> {
  const { name, label, properties, aliases } = entity;

  // If the entity has aliases, check whether any existing node matches an alias.
  // This handles renames: if a character was previously stored under an alias,
  // we find that node and add the new name as an alias instead of creating a duplicate.
  //
  // D-30 hardening: bind the AUTHORITATIVE bookId from the extraction result,
  // not properties.bookId (which is caller-injected and could be missing — a
  // null bookId here made the alias lookup silently match nothing, and the
  // MERGE below used to fall back to bookId "" creating unscoped nodes).
  if (aliases && aliases.length > 0) {
    const aliasResult = await session.run(
      `MATCH (n:${escapeLabelForQuery(label)} {bookId: $bookId})
       WHERE n.name IN $aliases OR any(a IN coalesce(n.aliases, []) WHERE a IN $aliases)
       RETURN n.name AS existingName LIMIT 1`,
      {
        bookId,
        aliases,
      }
    );

    // If we found an existing node by alias, merge by its name (not our new name)
    // and add our name as an alias
    if (aliasResult.records.length > 0) {
      const existingName = aliasResult.records[0].get("existingName") as string;
      if (existingName && existingName !== name) {
        // Update the existing node: add our name to its aliases
        await session.run(
          `MATCH (n:${escapeLabelForQuery(label)} {bookId: $bookId, name: $existingName})
           SET n.aliases = CASE
             WHEN $newName IN coalesce(n.aliases, []) THEN n.aliases
             ELSE coalesce(n.aliases, []) + $newName
           END,
           n.updatedAt = datetime(),
           n.lastMentioned = $chapter
           RETURN n`,
          {
            bookId,
            existingName,
            newName: name,
            chapter: chapterNumber,
          }
        );
        return { created: 0, updated: 1 };
      }
    }
  }

  // Build properties map for Cypher (name is in the MERGE key; bookId is
  // pinned to the authoritative value so a stray/missing properties.bookId
  // can never relabel or unscope the node)
  const now = new Date().toISOString();
  const allProps: Record<string, unknown> = {
    ...properties,
    bookId,
    contentHash,
    lastMentioned: chapterNumber,
    updatedAt: now,
  };
  // chapter / occursInChapter (Event) and deathChapter (Character) are
  // application-derived facts, and aliases is a UNION-not-replace set (D-27) —
  // all handled below with stable / union semantics. Keep them OUT of allProps
  // so the ON MATCH `+= $updateProps` merge cannot destructively overwrite them.
  delete allProps.chapter;
  delete allProps.occursInChapter;
  delete allProps.deathChapter;
  delete allProps.aliases;
  // RC-6 defense in depth: stamp the authoritative tenant onto the node when the
  // caller supplied one. Never trust a caller-injected userId in `properties`;
  // strip it and set only the authoritative value. Omitting it (legacy callers)
  // leaves any previously-stamped userId intact on ON MATCH.
  delete allProps.userId;
  if (userId) {
    allProps.userId = userId;
  }

  // D-19: Event.chapter and Character.deathChapter are read by
  // runConsistencyChecks() (graph-queries.ts) but the extraction LLM is never
  // asked for them and never reliably emits them. We stamp them deterministically
  // from the chapter being scanned — mirroring how relationship.chapter is
  // injected in upsertRelationship() — so those checks can populate at all.
  //
  // Both are STABLE, FIRST-OCCURRENCE facts (like firstAppearance, NOT
  // lastMentioned): written on ON CREATE, and on ON MATCH preserved via coalesce
  // so a later re-scan / re-mention never overwrites the original. Setting them
  // on ON CREATE too means a Character introduced already-dead (posthumous /
  // off-page death) gets deathChapter, not only a live→dead transition seen on a
  // later match; and an Event keeps the chapter it OCCURRED in, not the chapter
  // it was last mentioned in.
  const derived = deriveEntityGraphProps(label, properties, chapterNumber);

  const createProps: Record<string, unknown> = { ...allProps };
  const onMatchStableItems: string[] = [];
  if (derived.chapter !== undefined) {
    // Event.chapter — NARRATING chapter (display / timeline ordering).
    createProps.chapter = derived.chapter;
    onMatchStableItems.push("n.chapter = coalesce(n.chapter, $chapter)");
  }
  if (derived.occursInChapter !== undefined) {
    // Event.occursInChapter — STORY-time (RC-2). Stable first-occurrence fact,
    // preserved on ON MATCH via coalesce so a re-scan can't churn it. Carries
    // its own $occursInChapter param since it may differ from the narrating
    // $chapter (a flashback narrated later still occurs in its earlier chapter).
    //
    // FP-A guard (regression vs committed D-19): a PRE-FIX legacy Event
    // (occursInChapter NULL, e.g. chapter=3) re-mentioned during a LATER
    // chapter's extraction (say ch9) arrives here with $chapter=$occursInChapter=9
    // and, by the stochastic default, no rule-8 hint. A naive
    // coalesce(n.occursInChapter, $occursInChapter) would backfill 9 — inventing a
    // story-time that re-opens the exact D-32(b) dead_character_reappears FP and
    // FREEZES it (coalesce never overwrites the now non-null value; re-scanning
    // the origin chapter can't repair it). Instead, only adopt the supplied
    // story-time when this IS the node's origin chapter (n.chapter = $chapter);
    // otherwise backfill from the node's OWN narrating chapter, which reproduces
    // the pre-fix read semantics exactly. A legacy node thus learns real
    // story-time only when re-scanned at its origin chapter; post-fix
    // CREATE-stamped nodes already carry occursInChapter, so coalesce keeps it.
    createProps.occursInChapter = derived.occursInChapter;
    onMatchStableItems.push(
      "n.occursInChapter = coalesce(n.occursInChapter, CASE WHEN n.chapter = $chapter THEN $occursInChapter ELSE n.chapter END)"
    );
  }
  if (derived.deathChapter !== undefined) {
    // Character.deathChapter — powers dead_character_reappears. derived.deathChapter
    // === chapterNumber, so the $chapter param serves both the create value and
    // the match-preserve coalesce.
    createProps.deathChapter = derived.deathChapter;
    onMatchStableItems.push("n.deathChapter = coalesce(n.deathChapter, $chapter)");
  }
  if (aliases && aliases.length > 0) {
    // D-27: aliases are UNIONed, never replaced. Seed the set on ON CREATE; on
    // ON MATCH append only the aliases not already present, preserving every
    // existing variant — so a later chapter emitting a subset (e.g. ["Zoe"])
    // cannot drop an existing diacritic variant ("Zoë"). Kept out of the
    // `+= $updateProps` map, which would destructively overwrite the array.
    createProps.aliases = aliases;
    onMatchStableItems.push(
      "n.aliases = coalesce(n.aliases, []) + [a IN $aliases WHERE NOT a IN coalesce(n.aliases, [])]"
    );
  }
  const onMatchClause =
    onMatchStableItems.length > 0
      ? `ON MATCH SET n += $updateProps, ${onMatchStableItems.join(", ")}`
      : "ON MATCH SET n += $updateProps";

  const mergeParams: Record<string, unknown> = {
    bookId,
    name,
    chapter: chapterNumber,
    createProps,
    updateProps: allProps,
  };
  if (derived.occursInChapter !== undefined) {
    mergeParams.occursInChapter = derived.occursInChapter;
  }
  if (aliases && aliases.length > 0) {
    mergeParams.aliases = aliases;
  }

  // Use MERGE on (bookId, name) with ON CREATE / ON MATCH
  const mergeResult = await session.run(
    `MERGE (n:${escapeLabelForQuery(label)} {bookId: $bookId, name: $name})
     ON CREATE SET n += $createProps, n.id = randomUUID(), n.createdAt = datetime(), n.firstAppearance = $chapter
     ${onMatchClause}
     RETURN n.createdAt = n.updatedAt AS isNew`,
    mergeParams
  );

  if (mergeResult.records.length > 0) {
    // ON CREATE sets createdAt = datetime() and ON MATCH does not,
    // so we check if the node was just created by checking the return value
    const record = mergeResult.records[0];
    const isNew = record.get("isNew") as boolean;
    return isNew ? { created: 1, updated: 0 } : { created: 0, updated: 1 };
  }

  return { created: 0, updated: 0 };
}

/**
 * Upsert a relationship between two entities OF THE CALLING BOOK.
 * Uses MERGE to avoid duplicates.
 *
 * D-30 fix: both endpoint MATCHes bind {name, bookId}. The previous query
 * matched by name alone with only a relative `WHERE a.bookId = b.bookId`,
 * which produced the cross-product of same-named pairs across ALL books
 * (including other users' — character names are author-chosen free text) and
 * MERGEd the edge onto every pair: one book's extraction silently corrupted
 * every other book containing the same character names, producing false
 * continuity flags in books the author never touched.
 */
async function upsertRelationship(
  session: import("neo4j-driver").Session,
  rel: ExtractedRelationship,
  bookId: string,
  chapterNumber: number,
  userId?: string
): Promise<boolean> {
  const { from, fromLabel, to, toLabel, type, properties } = rel;

  // Defense in depth (D-30): never run the MERGE without a book scope.
  if (!bookId) {
    console.error(
      `[graph-builder] Refusing to upsert relationship ${from}-[${type}]->${to} without bookId (D-30)`
    );
    return false;
  }

  const relProps: Record<string, unknown> = {
    ...(properties ?? {}),
    chapter: chapterNumber,
    updatedAt: new Date().toISOString(),
    // RC-6 defense in depth: tag the edge's owning tenant when known.
    ...(userId ? { userId } : {}),
  };

  // D-63: `type` is free-form LLM output (the agent UpdateGraphEntity tool
  // declares it an unconstrained string and the `as RelationshipType` cast is a
  // runtime no-op), so it MUST be sanitized before it is interpolated into the
  // relationship pattern below — exactly as node labels go through
  // escapeLabelForQuery(). Without this, a crafted type breaks out of `[r:...]`
  // and runs unscoped Cypher across every tenant's graph.
  const relType = sanitizeRelationshipType(type);

  try {
    const result = await session.run(
      `MATCH (a:${escapeLabelForQuery(fromLabel)} {name: $fromName, bookId: $bookId})
       MATCH (b:${escapeLabelForQuery(toLabel)} {name: $toName, bookId: $bookId})
       MERGE (a)-[r:${relType}]->(b)
       ON CREATE SET r += $props, r.createdAt = datetime()
       ON MATCH SET r += $props
       RETURN r`,
      {
        fromName: from,
        toName: to,
        bookId,
        props: relProps,
      }
    );
    return result.records.length > 0;
  } catch (error) {
    console.error(
      `[graph-builder] Failed to upsert relationship ${from}-[${type}]->${to}:`,
      error
    );
    return false;
  }
}

/**
 * Remove entities that were ONLY sourced from a specific chapter.
 * Used before re-extraction to clean up stale data.
 * Entities that appear in multiple chapters are preserved.
 */
export async function removeChapterEntities(
  bookId: string,
  chapterNumber: number
): Promise<void> {
  await withSession("WRITE", async (session) => {
    // Remove relationships tagged with this chapter that don't exist in other chapters
    await session.run(
      `MATCH (n {bookId: $bookId})-[r]-(m {bookId: $bookId})
       WHERE r.chapter = $chapter
       AND NOT EXISTS {
         MATCH (n)-[r2]-(m)
         WHERE r2.chapter <> $chapter
       }
       DELETE r`,
      { bookId, chapter: chapterNumber }
    );

    // Remove nodes that only appeared in this chapter (firstAppearance = lastMentioned = chapter)
    await session.run(
      `MATCH (n {bookId: $bookId})
       WHERE n.firstAppearance = $chapter
       AND n.lastMentioned = $chapter
       AND NOT EXISTS {
         MATCH (n)-[r]-()
         WHERE r.chapter <> $chapter
       }
       DETACH DELETE n`,
      { bookId, chapter: chapterNumber }
    );
  });
}

/**
 * Escape a label string for safe use in Cypher queries.
 * Labels can only contain alphanumeric characters and underscores.
 */
function escapeLabelForQuery(label: GraphNodeLabel): string {
  // Our labels are from a fixed enum, but sanitize anyway
  return label.replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * Canonical relationship-type lookup keyed by UPPERCASE form, so a case /
 * whitespace variant from the LLM (e.g. "allied_with") normalizes back to the
 * exact union member the continuity checks key off (":ALLIED_WITH").
 */
const CANONICAL_RELATIONSHIP_TYPES: ReadonlyMap<string, string> = new Map(
  RELATIONSHIP_TYPES.map((t) => [t, t])
);

/**
 * Fallback used when a relationship type sanitizes to the empty string (all
 * symbols / whitespace). Deliberately NOT a member of RelationshipType, so it
 * lands in a neutral bucket instead of silently colliding with a
 * continuity-check type.
 */
const RELATIONSHIP_TYPE_FALLBACK = "RELATED_TO";

/**
 * Sanitize an LLM-supplied relationship type before it is interpolated into a
 * Cypher `MERGE (a)-[r:${type}]->(b)` pattern (D-63).
 *
 * The value is untrusted free-form model output, so a crafted string such as
 * `KNOWS]->(b) WITH a MATCH (n) DETACH DELETE n //` would otherwise break out
 * of the relationship pattern and run attacker Cypher across every tenant's
 * graph. Neo4j relationship types are `[A-Za-z0-9_]`:
 *
 *   (a) a known type (case-insensitive, trimmed) → its canonical union form;
 *   (b) anything else → uppercased and stripped to a bare `[A-Z0-9_]` identifier
 *       (a leading digit is prefixed with `_` so the bare type is valid Cypher
 *       rather than a syntax error — turning a would-be silent drop into a write);
 *   (c) an empty / all-symbol result → RELATIONSHIP_TYPE_FALLBACK, never empty.
 *
 * The result always matches /^[A-Za-z0-9_]+$/, so it cannot contain the
 * brackets, spaces, or comment markers an injection needs. Exported for unit
 * testing.
 */
export function sanitizeRelationshipType(raw: unknown): string {
  const asString = typeof raw === "string" ? raw : String(raw ?? "");
  const normalized = asString.trim().toUpperCase();

  const canonical = CANONICAL_RELATIONSHIP_TYPES.get(normalized);
  if (canonical) {
    return canonical;
  }

  const stripped = normalized.replace(/[^A-Z0-9_]/g, "");
  if (stripped.length === 0) {
    return RELATIONSHIP_TYPE_FALLBACK;
  }
  return /^[0-9]/.test(stripped) ? `_${stripped}` : stripped;
}

/**
 * Continuity properties derived deterministically at upsert time (D-19).
 *
 * The consistency checks in graph-queries.ts read these; they are NOT taken
 * from the (unreliable) LLM output but injected from application code, mirroring
 * how relationship.chapter is set in upsertRelationship().
 */
export interface DerivedEntityGraphProps {
  /** Event.chapter — NARRATING chapter this Event was extracted from. */
  chapter?: number;
  /**
   * Event.occursInChapter — STORY-time chapter (RC-2 / D-32). Defaults to the
   * narrating chapter; overridden by a validated LLM story-time hint so a
   * flashback / retelling narrated later does not present as a present-time
   * event to the consistency checks.
   */
  occursInChapter?: number;
  /** Character.deathChapter — chapter a death was first detected (>= 1). */
  deathChapter?: number;
}

/**
 * Coerce an untrusted story-time hint (LLM-emitted `occursInChapter`) into a
 * non-negative integer chapter, or `undefined` when it is absent/garbage so the
 * caller can fall back to the narrating chapter. Accepts a number or a clean
 * integer string; rejects negatives, non-integers, NaN, and anything else. A
 * value ABOVE the narrating chapter is allowed (a prophecy/foreshadowing of a
 * future event is legitimately narrated before it happens). Exported for tests.
 */
export function coerceStoryChapter(raw: unknown): number | undefined {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * True when a Character's status means "dead" — matched to the exact value the
 * dead_character_reappears check keys off (`c.status = "dead"`), tolerating
 * surrounding whitespace/case. A synonym like "deceased" is intentionally NOT
 * treated as dead: the check compares against the literal "dead", so recording
 * a deathChapter for any other value could never make it fire.
 */
export function isDeadStatus(status: unknown): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === "dead";
}

/**
 * Derive the application-controlled continuity properties for an entity being
 * upserted during chapter `chapterNumber`'s extraction.
 *
 * - Event.chapter powers location_conflict (e1.chapter = e2.chapter) and
 *   timeline_violation (later.chapter > earlier.chapter).
 * - Character.deathChapter powers dead_character_reappears. Only derived for
 *   in-story chapters (>= 1); chapter 0 is the canonical story bible, where a
 *   "dead" status is pre-story backstory rather than an in-story death event.
 */
export function deriveEntityGraphProps(
  label: GraphNodeLabel,
  properties: Record<string, unknown>,
  chapterNumber: number
): DerivedEntityGraphProps {
  const derived: DerivedEntityGraphProps = {};

  if (label === "Event") {
    derived.chapter = chapterNumber;
    // Story-time: use a valid LLM hint if present, else the narrating chapter.
    // Chapter 0 (story bible) events keep story-time 0 as well.
    const hint = coerceStoryChapter(properties.occursInChapter);
    derived.occursInChapter = hint !== undefined ? hint : chapterNumber;
  }

  if (
    label === "Character" &&
    chapterNumber >= 1 &&
    isDeadStatus(properties.status)
  ) {
    derived.deathChapter = chapterNumber;
  }

  return derived;
}
