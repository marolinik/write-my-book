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
  if (aliases && aliases.length > 0) {
    allProps.aliases = aliases;
  }

  // Use MERGE on (bookId, name) with ON CREATE / ON MATCH
  const mergeResult = await session.run(
    `MERGE (n:${escapeLabelForQuery(label)} {bookId: $bookId, name: $name})
     ON CREATE SET n += $createProps, n.id = randomUUID(), n.createdAt = datetime(), n.firstAppearance = $chapter
     ON MATCH SET n += $updateProps
     RETURN n.createdAt = n.updatedAt AS isNew`,
    {
      bookId: allProps.bookId ?? "",
      name,
      chapter: chapterNumber,
      createProps: allProps,
      updateProps: allProps,
    }
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
