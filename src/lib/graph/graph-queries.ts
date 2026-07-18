/**
 * Pre-built Cypher queries for agents to use.
 * Provides character network, timeline, location map, plot threads,
 * per-chapter entity summaries, and consistency checks.
 */

import { withSession } from "./neo4j-client";
import type {
  CharacterNetwork,
  TimelineEvent,
  LocationMap,
  PlotThreadSummary,
  ConsistencyIssue,
} from "./types";

/**
 * FOUNDER-DECISION (D-19): the location_conflict check is DISABLED.
 *
 * It flags a character associated with two different locations via events in the
 * SAME chapter as a contradiction. But the graph has no scene / adjacency / time
 * granularity to distinguish a legitimate within-chapter MOVE (docks → castle)
 * from an impossible teleport — Scene nodes are explicitly NOT extracted (see
 * entity-extractor.validateEntity, which drops Scene/Chapter labels). Firing it
 * as-is would produce constant false positives on ordinary multi-location
 * chapters, so it is gated OFF pending scene-level continuity modelling rather
 * than shipped noisy. See cowork/bulletproof-qa-2026-07-17/evidence/p3-selena/defects.md (D-19).
 *
 * Typed `boolean` (not the literal `false`) so the guarded block stays reachable
 * to the type-checker and is not treated as dead code.
 */
const ENABLE_LOCATION_CONFLICT_CHECK: boolean = false;

/**
 * Get the character network for a book: all characters and their inter-relationships.
 */
export async function getCharacterNetwork(
  bookId: string
): Promise<CharacterNetwork> {
  return withSession("READ", async (session) => {
    // Get all characters with their connection counts
    const charResult = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       OPTIONAL MATCH (c)-[r]-(other:Character {bookId: $bookId})
       RETURN c.name AS name, c.role AS role, count(DISTINCT r) AS connections
       ORDER BY connections DESC`,
      { bookId }
    );

    const characters = charResult.records.map((rec) => ({
      name: rec.get("name") as string,
      role: (rec.get("role") as string) ?? "minor",
      connections: (rec.get("connections") as { toNumber?: () => number })?.toNumber
        ? (rec.get("connections") as { toNumber: () => number }).toNumber()
        : Number(rec.get("connections")),
    }));

    // Get all character-to-character relationships with weights
    const relResult = await session.run(
      `MATCH (a:Character {bookId: $bookId})-[r]-(b:Character {bookId: $bookId})
       WHERE id(a) < id(b)
       RETURN a.name AS from, b.name AS to, type(r) AS relType, count(r) AS weight
       ORDER BY weight DESC`,
      { bookId }
    );

    const relationships = relResult.records.map((rec) => ({
      from: rec.get("from") as string,
      to: rec.get("to") as string,
      type: rec.get("relType") as CharacterNetwork["relationships"][number]["type"],
      weight: (rec.get("weight") as { toNumber?: () => number })?.toNumber
        ? (rec.get("weight") as { toNumber: () => number }).toNumber()
        : Number(rec.get("weight")),
    }));

    return { characters, relationships };
  });
}

/**
 * Get the timeline of events for a book, optionally filtered by chapter range.
 */
export async function getTimeline(
  bookId: string,
  chapterRange?: [number, number]
): Promise<TimelineEvent[]> {
  return withSession("READ", async (session) => {
    const hasRange = chapterRange !== undefined;
    const query = hasRange
      ? `MATCH (e:Event {bookId: $bookId})
         WHERE e.chapter >= $startChapter AND e.chapter <= $endChapter
         OPTIONAL MATCH (c:Character {bookId: $bookId})-[:PARTICIPATES_IN]->(e)
         OPTIONAL MATCH (e)-[:LOCATED_AT]->(l:Location {bookId: $bookId})
         RETURN e.name AS name, e.chapter AS chapter, e.significance AS significance,
                e.timelinePosition AS timelinePosition,
                collect(DISTINCT c.name) AS participants,
                head(collect(DISTINCT l.name)) AS location
         ORDER BY e.chapter ASC, e.timelinePosition ASC`
      : `MATCH (e:Event {bookId: $bookId})
         OPTIONAL MATCH (c:Character {bookId: $bookId})-[:PARTICIPATES_IN]->(e)
         OPTIONAL MATCH (e)-[:LOCATED_AT]->(l:Location {bookId: $bookId})
         RETURN e.name AS name, e.chapter AS chapter, e.significance AS significance,
                e.timelinePosition AS timelinePosition,
                collect(DISTINCT c.name) AS participants,
                head(collect(DISTINCT l.name)) AS location
         ORDER BY e.chapter ASC, e.timelinePosition ASC`;

    const params: Record<string, unknown> = { bookId };
    if (hasRange) {
      params.startChapter = chapterRange[0];
      params.endChapter = chapterRange[1];
    }

    const result = await session.run(query, params);

    return result.records.map((rec) => ({
      name: rec.get("name") as string,
      chapter: toNumber(rec.get("chapter")),
      significance: (rec.get("significance") as string) ?? "minor",
      participants: (rec.get("participants") as string[]) ?? [],
      location: (rec.get("location") as string) ?? undefined,
      timelinePosition: (rec.get("timelinePosition") as string) ?? undefined,
    }));
  });
}

/**
 * Get the location map: all locations with child locations, characters, and events.
 */
export async function getLocationMap(bookId: string): Promise<LocationMap> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (l:Location {bookId: $bookId})
       OPTIONAL MATCH (child:Location {bookId: $bookId})-[:PART_OF]->(l)
       OPTIONAL MATCH (c:Character {bookId: $bookId})-[:APPEARS_IN|LOCATED_AT]-(s)-[:LOCATED_AT]->(l)
       OPTIONAL MATCH (e:Event {bookId: $bookId})-[:LOCATED_AT]->(l)
       RETURN l.name AS name, l.locationType AS type,
              collect(DISTINCT child.name) AS childLocations,
              collect(DISTINCT c.name) AS characters,
              collect(DISTINCT e.name) AS events
       ORDER BY l.name`,
      { bookId }
    );

    const locations = result.records.map((rec) => ({
      name: rec.get("name") as string,
      type: (rec.get("type") as string) ?? "other",
      childLocations: filterNulls(rec.get("childLocations") as (string | null)[]),
      characters: filterNulls(rec.get("characters") as (string | null)[]),
      events: filterNulls(rec.get("events") as (string | null)[]),
    }));

    return { locations };
  });
}

/**
 * Get all plot threads for a book with their associated characters.
 */
export async function getPlotThreads(
  bookId: string
): Promise<PlotThreadSummary> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (p:PlotThread {bookId: $bookId})
       OPTIONAL MATCH (c:Character {bookId: $bookId})-[:PARTICIPATES_IN|MENTIONED_IN]-(p)
       OPTIONAL MATCH (e:Event {bookId: $bookId})-[:RESOLVES]->(p)
       RETURN p.name AS name, p.threadType AS type, p.status AS status,
              p.introducedChapter AS introducedChapter,
              p.resolvedChapter AS resolvedChapter,
              collect(DISTINCT c.name) AS relatedCharacters
       ORDER BY p.introducedChapter ASC`,
      { bookId }
    );

    const threads = result.records.map((rec) => ({
      name: rec.get("name") as string,
      type: (rec.get("type") as string) ?? "subplot",
      status: (rec.get("status") as string) ?? "developing",
      introducedChapter: toNumber(rec.get("introducedChapter")),
      resolvedChapter: rec.get("resolvedChapter") != null
        ? toNumber(rec.get("resolvedChapter"))
        : undefined,
      relatedCharacters: filterNulls(rec.get("relatedCharacters") as (string | null)[]),
    }));

    return { threads };
  });
}

/**
 * Get all entities present in a specific chapter.
 */
export async function getChapterEntities(
  bookId: string,
  chapterNumber: number
): Promise<{
  characters: string[];
  locations: string[];
  events: string[];
  objects: string[];
}> {
  return withSession("READ", async (session) => {
    // Characters that appear or are mentioned in this chapter
    const charResult = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       WHERE c.firstAppearance <= $chapter AND c.lastMentioned >= $chapter
       RETURN collect(DISTINCT c.name) AS names`,
      { bookId, chapter: chapterNumber }
    );

    // Events in this chapter
    const eventResult = await session.run(
      `MATCH (e:Event {bookId: $bookId, chapter: $chapter})
       RETURN collect(DISTINCT e.name) AS names`,
      { bookId, chapter: chapterNumber }
    );

    // Locations referenced in this chapter's events
    const locResult = await session.run(
      `MATCH (e:Event {bookId: $bookId, chapter: $chapter})-[:LOCATED_AT]->(l:Location {bookId: $bookId})
       RETURN collect(DISTINCT l.name) AS names`,
      { bookId, chapter: chapterNumber }
    );

    // Objects mentioned in this chapter
    const objResult = await session.run(
      `MATCH (o:Object {bookId: $bookId})
       WHERE o.firstAppearance <= $chapter AND o.lastMentioned >= $chapter
       RETURN collect(DISTINCT o.name) AS names`,
      { bookId, chapter: chapterNumber }
    );

    return {
      characters: (charResult.records[0]?.get("names") as string[]) ?? [],
      locations: (locResult.records[0]?.get("names") as string[]) ?? [],
      events: (eventResult.records[0]?.get("names") as string[]) ?? [],
      objects: (objResult.records[0]?.get("names") as string[]) ?? [],
    };
  });
}

export interface BookCharacterState {
  name: string;
  aliases: string[];
  role: string | null;
  status: string | null;
  lastMentioned: number | null;
  firstAppearance: number | null;
  description: string | null;
}

/**
 * Get full state for every character in a book (role, status, aliases, chapter
 * span, description). Used by ambient series awareness to surface a prior
 * book's character state while writing a later book. Read-only, no LLM.
 */
export async function getBookCharacterStates(
  bookId: string
): Promise<BookCharacterState[]> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       RETURN c.name AS name, c.aliases AS aliases, c.role AS role,
              c.status AS status, c.lastMentioned AS lastMentioned,
              c.firstAppearance AS firstAppearance, c.description AS description
       ORDER BY c.lastMentioned DESC`,
      { bookId }
    );

    return result.records.map((rec) => ({
      name: rec.get("name") as string,
      aliases: (rec.get("aliases") as string[] | null) ?? [],
      role: (rec.get("role") as string | null) ?? null,
      status: (rec.get("status") as string | null) ?? null,
      lastMentioned:
        rec.get("lastMentioned") != null ? toNumber(rec.get("lastMentioned")) : null,
      firstAppearance:
        rec.get("firstAppearance") != null ? toNumber(rec.get("firstAppearance")) : null,
      description: (rec.get("description") as string | null) ?? null,
    }));
  });
}

/**
 * When the Chapter node was last (re)extracted into the graph — used to
 * time-throttle re-extraction on the live continuity scan. Null if never
 * extracted. Note: c.updatedAt is written via Cypher datetime(), so the driver
 * returns a temporal object, not a string — coerce via toString() before Date.
 */
export async function getChapterNodeUpdatedAt(
  bookId: string,
  chapterNumber: number
): Promise<Date | null> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       RETURN c.updatedAt AS updatedAt`,
      { bookId, chapterNumber }
    );
    const raw: unknown = result.records[0]?.get("updatedAt");
    if (raw === null || raw === undefined) return null;
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  });
}

/**
 * Run 6 consistency checks on the book's knowledge graph.
 * Returns issues sorted by severity.
 */
export async function runConsistencyChecks(
  bookId: string
): Promise<ConsistencyIssue[]> {
  const issues: ConsistencyIssue[] = [];

  await withSession("READ", async (session) => {
    // 1. Characters appearing in chapter but not in story bible
    // (Characters with no description and role "mentioned" that appear in multiple chapters
    //  likely should be documented in the story bible)
    const undocumentedResult = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       WHERE c.role = "mentioned" AND c.description IS NULL
       AND c.lastMentioned > c.firstAppearance
       RETURN c.name AS name, c.firstAppearance AS firstChapter, c.lastMentioned AS lastChapter`,
      { bookId }
    );
    for (const rec of undocumentedResult.records) {
      const firstChapter = toNumber(rec.get("firstChapter"));
      const lastChapter = toNumber(rec.get("lastChapter"));
      issues.push({
        type: "character_undocumented",
        severity: "minor",
        description: `Character "${rec.get("name")}" appears across chapters ${firstChapter}-${lastChapter} but has no description or documented role. Consider adding to story bible.`,
        entities: [rec.get("name") as string],
        chapters: [firstChapter, lastChapter],
      });
    }

    // 2. Location conflicts — DISABLED (founder-decision, see
    //    ENABLE_LOCATION_CONFLICT_CHECK above). Left in place, gated off, so it
    //    can be re-enabled once scene-level continuity modelling exists to tell a
    //    legitimate within-chapter move from a teleport. As-is it false-positives
    //    on any character who legitimately changes location within one chapter.
    if (ENABLE_LOCATION_CONFLICT_CHECK) {
      const locationConflictResult = await session.run(
        `MATCH (c:Character {bookId: $bookId})-[:PARTICIPATES_IN]->(e1:Event {bookId: $bookId})-[:LOCATED_AT]->(l1:Location {bookId: $bookId})
         MATCH (c)-[:PARTICIPATES_IN]->(e2:Event {bookId: $bookId})-[:LOCATED_AT]->(l2:Location {bookId: $bookId})
         WHERE e1.chapter = e2.chapter AND id(e1) < id(e2) AND l1.name <> l2.name
         AND NOT (l1)-[:PART_OF*]-(l2)
         RETURN c.name AS character, e1.chapter AS chapter,
                l1.name AS location1, l2.name AS location2,
                e1.name AS event1, e2.name AS event2`,
        { bookId }
      );
      for (const rec of locationConflictResult.records) {
        const chapter = toNumber(rec.get("chapter"));
        issues.push({
          type: "location_conflict",
          severity: "major",
          description: `Character "${rec.get("character")}" is at "${rec.get("location1")}" (${rec.get("event1")}) and "${rec.get("location2")}" (${rec.get("event2")}) in the same chapter ${chapter}.`,
          entities: [
            rec.get("character") as string,
            rec.get("location1") as string,
            rec.get("location2") as string,
          ],
          chapters: [chapter],
        });
      }
    }

    // 3. Timeline violations — KNOWN-LIMITED (founder-decision, D-19). Fires only
    //    on a LEADS_TO edge whose later event sits in a higher chapter than the
    //    earlier one. In practice validateRelationship() only keeps a relationship
    //    when BOTH endpoints appear in the same extraction batch (one chapter), so
    //    cross-chapter LEADS_TO edges are never persisted and
    //    later.chapter > earlier.chapter cannot arise. The Event.chapter-stable
    //    fix helps but does not create cross-chapter causal edges. Left enabled
    //    (it cannot false-positive) but not to be relied upon until cross-chapter
    //    causal links are modelled. Same scene-modelling bucket as location_conflict.
    const timelineResult = await session.run(
      `MATCH (later:Event {bookId: $bookId})-[:LEADS_TO]->(earlier:Event {bookId: $bookId})
       WHERE later.chapter > earlier.chapter
       RETURN later.name AS laterEvent, later.chapter AS laterChapter,
              earlier.name AS earlierEvent, earlier.chapter AS earlierChapter`,
      { bookId }
    );
    for (const rec of timelineResult.records) {
      const laterChapter = toNumber(rec.get("laterChapter"));
      const earlierChapter = toNumber(rec.get("earlierChapter"));
      issues.push({
        type: "timeline_violation",
        severity: "critical",
        description: `Event "${rec.get("laterEvent")}" (chapter ${laterChapter}) is marked as leading to "${rec.get("earlierEvent")}" (chapter ${earlierChapter}), but it occurs later in the story.`,
        entities: [rec.get("laterEvent") as string, rec.get("earlierEvent") as string],
        chapters: [earlierChapter, laterChapter],
      });
    }

    // 4. Dead characters reappearing after their death chapter.
    //    D-19 precision fix: require a REAL post-death participation event
    //    (MATCH, not OPTIONAL). We deliberately do NOT gate on
    //    `c.lastMentioned > c.deathChapter`: lastMentioned increments on ANY
    //    upsert, so a later MENTIONED_IN (grieving, remembering, being named —
    //    all normal for a dead character) would false-flag. Only an actual
    //    PARTICIPATES_IN event in a chapter after death is a real contradiction.
    const deadCharResult = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       WHERE c.status = "dead" AND c.deathChapter IS NOT NULL
       MATCH (c)-[:PARTICIPATES_IN]->(e:Event {bookId: $bookId})
       WHERE e.chapter > c.deathChapter
       RETURN c.name AS character, c.deathChapter AS deathChapter,
              collect(DISTINCT e.chapter) AS postDeathChapters`,
      { bookId }
    );
    for (const rec of deadCharResult.records) {
      const deathChapter = toNumber(rec.get("deathChapter"));
      // The MATCH guarantees at least one post-death participation chapter.
      const postDeathChapters = (rec.get("postDeathChapters") as unknown[])
        .map((ch) => toNumber(ch))
        .filter((ch) => ch > 0);
      issues.push({
        type: "dead_character_reappears",
        severity: "critical",
        description: `Character "${rec.get("character")}" dies in chapter ${deathChapter} but participates in events in chapters ${postDeathChapters.join(", ")}.`,
        entities: [rec.get("character") as string],
        chapters: [deathChapter, ...postDeathChapters],
      });
    }

    // 5. Orphan plot threads: introduced 3+ chapters ago, still "developing" or "introduced"
    const orphanThreadResult = await session.run(
      `MATCH (p:PlotThread {bookId: $bookId})
       WHERE p.status IN ["introduced", "developing"]
       AND p.resolvedChapter IS NULL
       OPTIONAL MATCH (c:Chapter {bookId: $bookId})
       WITH p, max(c.chapterNumber) AS maxChapter
       WHERE maxChapter IS NOT NULL AND (maxChapter - p.introducedChapter) >= 3
       RETURN p.name AS thread, p.status AS status,
              p.introducedChapter AS introducedChapter, maxChapter`,
      { bookId }
    );
    for (const rec of orphanThreadResult.records) {
      const introducedChapter = toNumber(rec.get("introducedChapter"));
      const maxChapter = toNumber(rec.get("maxChapter"));
      issues.push({
        type: "orphan_plot_thread",
        severity: "major",
        description: `Plot thread "${rec.get("thread")}" was introduced in chapter ${introducedChapter} (status: ${rec.get("status")}) and has not been resolved after ${maxChapter - introducedChapter} chapters.`,
        entities: [rec.get("thread") as string],
        chapters: [introducedChapter],
      });
    }

    // 6. Relationship contradictions: two characters are both ALLIED_WITH and OPPOSES each other
    const contradictionResult = await session.run(
      `MATCH (a:Character {bookId: $bookId})-[:ALLIED_WITH]-(b:Character {bookId: $bookId})
       WHERE (a)-[:OPPOSES]-(b) AND id(a) < id(b)
       RETURN a.name AS char1, b.name AS char2`,
      { bookId }
    );
    for (const rec of contradictionResult.records) {
      issues.push({
        type: "relationship_contradiction",
        severity: "major",
        description: `Characters "${rec.get("char1")}" and "${rec.get("char2")}" are marked as both ALLIED_WITH and OPPOSES each other simultaneously.`,
        entities: [rec.get("char1") as string, rec.get("char2") as string],
        chapters: [],
      });
    }
  });

  // Sort by severity: critical > major > minor
  const severityOrder: Record<string, number> = {
    critical: 0,
    major: 1,
    minor: 2,
  };
  issues.sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  return issues;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Safely convert a Neo4j integer (or JS number) to a JS number.
 */
function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

/**
 * Filter null/undefined values from an array of strings.
 */
function filterNulls(arr: (string | null | undefined)[]): string[] {
  return arr.filter((v): v is string => v != null && v !== "");
}
