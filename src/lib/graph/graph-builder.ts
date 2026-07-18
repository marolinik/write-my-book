/**
 * Graph builder: takes extracted entities and MERGE-upserts them into Neo4j.
 * Incremental: uses content hashes to skip unchanged sections.
 * Handles renames via alias tracking.
 */

import { withSession } from "./neo4j-client";
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

  await withSession("WRITE", async (session) => {
    // Pass 1: Upsert all entities
    for (const entity of result.entities) {
      const entityStats = await upsertSingleEntity(
        session,
        entity,
        result.chapterNumber,
        result.contentHash
      );
      stats.nodesCreated += entityStats.created;
      stats.nodesUpdated += entityStats.updated;
    }

    // Pass 2: Create all relationships
    for (const rel of result.relationships) {
      const created = await upsertRelationship(
        session,
        rel,
        result.chapterNumber
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
  chapterNumber: number,
  contentHash: string
): Promise<{ created: number; updated: number }> {
  const { name, label, properties, aliases } = entity;

  // If the entity has aliases, check whether any existing node matches an alias.
  // This handles renames: if a character was previously stored under an alias,
  // we find that node and add the new name as an alias instead of creating a duplicate.
  if (aliases && aliases.length > 0) {
    const aliasResult = await session.run(
      `MATCH (n:${escapeLabelForQuery(label)} {bookId: $bookId})
       WHERE n.name IN $aliases OR any(a IN coalesce(n.aliases, []) WHERE a IN $aliases)
       RETURN n.name AS existingName LIMIT 1`,
      {
        bookId: properties.bookId ?? (properties as Record<string, unknown>).bookId,
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
            bookId: properties.bookId,
            existingName,
            newName: name,
            chapter: chapterNumber,
          }
        );
        return { created: 0, updated: 1 };
      }
    }
  }

  // Build properties map for Cypher (exclude bookId and name which are in MERGE key)
  const now = new Date().toISOString();
  const allProps: Record<string, unknown> = {
    ...properties,
    contentHash,
    lastMentioned: chapterNumber,
    updatedAt: now,
  };
  // chapter (Event) and deathChapter (Character) are application-derived facts,
  // and aliases is a UNION-not-replace set (D-27) — all handled below with
  // stable / union semantics. Keep them OUT of allProps so the ON MATCH
  // `+= $updateProps` merge cannot destructively overwrite them.
  delete allProps.chapter;
  delete allProps.deathChapter;
  delete allProps.aliases;

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
    // Event.chapter — powers location_conflict / timeline_violation.
    createProps.chapter = derived.chapter;
    onMatchStableItems.push("n.chapter = coalesce(n.chapter, $chapter)");
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
    bookId: allProps.bookId ?? "",
    name,
    chapter: chapterNumber,
    createProps,
    updateProps: allProps,
  };
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
 * Upsert a relationship between two entities.
 * Uses MERGE to avoid duplicates.
 */
async function upsertRelationship(
  session: import("neo4j-driver").Session,
  rel: ExtractedRelationship,
  chapterNumber: number
): Promise<boolean> {
  const { from, fromLabel, to, toLabel, type, properties } = rel;

  const relProps: Record<string, unknown> = {
    ...(properties ?? {}),
    chapter: chapterNumber,
    updatedAt: new Date().toISOString(),
  };

  try {
    const result = await session.run(
      `MATCH (a:${escapeLabelForQuery(fromLabel)} {name: $fromName})
       MATCH (b:${escapeLabelForQuery(toLabel)} {name: $toName})
       WHERE a.bookId = b.bookId
       MERGE (a)-[r:${type}]->(b)
       ON CREATE SET r += $props, r.createdAt = datetime()
       ON MATCH SET r += $props
       RETURN r`,
      {
        fromName: from,
        toName: to,
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
 * Continuity properties derived deterministically at upsert time (D-19).
 *
 * The consistency checks in graph-queries.ts read these; they are NOT taken
 * from the (unreliable) LLM output but injected from application code, mirroring
 * how relationship.chapter is set in upsertRelationship().
 */
export interface DerivedEntityGraphProps {
  /** Event.chapter — numeric chapter this Event was extracted from. */
  chapter?: number;
  /** Character.deathChapter — chapter a death was first detected (>= 1). */
  deathChapter?: number;
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
