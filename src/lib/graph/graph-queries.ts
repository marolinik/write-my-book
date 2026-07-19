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
 * location_conflict check (RC-5 / D-32(c)): CORRECTED CYPHER, but gated OFF by
 * default — fires on ordinary intra-region travel otherwise (FP-B, live-proven).
 *
 * The corrected check (below) fires on a TIGHT co-location: two DISTINCT locations
 * that share an ancestor region (both PART_OF the same ancestor, neither containing
 * the other) reached in the same STORY-time chapter. That matches the seeded
 * impossible case — a character cannot unload grain at the Salt Docks and raid the
 * Cinder Ward in the same beat of Emberfall. Nested containment (a room inside its
 * building) is exempted via directed ancestry; unrelated far-apart locations (no
 * shared ancestor) are treated as legitimate travel and NOT flagged.
 *
 * WHY DEFAULT-OFF (FP-B): the shared-ancestor test is any-depth and the extraction
 * guidance solicits region/country/world parent chains, so an ORDINARY journey
 * across one realm — Salt Docks (PART_OF Emberfall PART_OF Ashfall Realm) and the
 * Northern Keep (PART_OF Ashfall Realm) visited in one chapter — is topologically
 * BYTE-IDENTICAL to the seeded true conflict and live-fires. Without scene /
 * story-beat granularity the graph cannot tell simultaneity from sequential travel,
 * so on any real fantasy corpus this over-flags normal movement. The corrected
 * Cypher is kept for when that granularity lands; the check simply does not run by
 * default. Ops can enable it per-deploy without a code change via the env var
 * (read at call time in runConsistencyChecks, so no redeploy is needed to flip it).
 */
function isLocationConflictCheckEnabled(): boolean {
  return process.env.ENABLE_LOCATION_CONFLICT_CHECK === "true";
}

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
    // The intermediate (s) hop (Scene/Event linking a character to a location)
    // binds bookId too (D-30 defense in depth): while cross-book-contaminated
    // edges exist, an unbound intermediate could route the traversal through
    // another book's node and misattribute characters to locations.
    const result = await session.run(
      `MATCH (l:Location {bookId: $bookId})
       OPTIONAL MATCH (child:Location {bookId: $bookId})-[:PART_OF]->(l)
       OPTIONAL MATCH (c:Character {bookId: $bookId})-[:APPEARS_IN|LOCATED_AT]-(s {bookId: $bookId})-[:LOCATED_AT]->(l)
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
  bookId: string,
  userId?: string
): Promise<ConsistencyIssue[]> {
  const issues: ConsistencyIssue[] = [];

  // RC-6 defense in depth: when a tenant is supplied, additionally exclude any
  // node whose userId is present AND differs. Null-safe (legacy un-stamped nodes
  // still match) so enforcement tightens as writes re-stamp nodes, without
  // dropping existing data. bookId stays the primary, ownership-verified scope.
  const params: Record<string, unknown> = userId ? { bookId, userId } : { bookId };
  const userGuard = (v: string): string =>
    userId ? ` AND (${v}.userId IS NULL OR ${v}.userId = $userId)` : "";

  await withSession("READ", async (session) => {
    // 1. Characters appearing in chapter but not in story bible
    // (Characters with no description and role "mentioned" that appear in multiple chapters
    //  likely should be documented in the story bible)
    const undocumentedResult = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       WHERE c.role = "mentioned" AND c.description IS NULL
       AND c.lastMentioned > c.firstAppearance${userGuard("c")}
       RETURN c.name AS name, c.firstAppearance AS firstChapter, c.lastMentioned AS lastChapter`,
      params
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

    // 2. Location conflicts — corrected Cypher, GATED OFF by default (FP-B; see
    //    isLocationConflictCheckEnabled above). When enabled, fires only when a
    //    character participates in two events at two DISTINCT locations sharing an
    //    ancestor (both PART_OF a shared region, neither nested in the other) in
    //    the same STORY-time chapter. Nested containment (room-in-building) is
    //    exempted via DIRECTED PART_OF ancestry; unrelated locations with no shared
    //    ancestor are legitimate travel and NOT flagged. Off by default because the
    //    any-depth shared-ancestor test also catches ordinary intra-region travel.
    if (isLocationConflictCheckEnabled()) {
      const locationConflictResult = await session.run(
        `MATCH (c:Character {bookId: $bookId})-[:PARTICIPATES_IN]->(e1:Event {bookId: $bookId})-[:LOCATED_AT]->(l1:Location {bookId: $bookId})
         MATCH (c)-[:PARTICIPATES_IN]->(e2:Event {bookId: $bookId})-[:LOCATED_AT]->(l2:Location {bookId: $bookId})
         WHERE coalesce(e1.occursInChapter, e1.chapter) = coalesce(e2.occursInChapter, e2.chapter)
         AND id(e1) < id(e2) AND l1.name <> l2.name
         AND NOT (l1)-[:PART_OF*]->(l2)
         AND NOT (l2)-[:PART_OF*]->(l1)
         AND EXISTS { MATCH (l1)-[:PART_OF*]->(shared:Location {bookId: $bookId})<-[:PART_OF*]-(l2) }${userGuard("c")}
         RETURN c.name AS character, coalesce(e1.occursInChapter, e1.chapter) AS chapter,
                l1.name AS location1, l2.name AS location2,
                e1.name AS event1, e2.name AS event2`,
        params
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

    // 3. Timeline violations (RC-2 / RC-5): a LEADS_TO edge whose SOURCE event
    //    occurs AFTER the TARGET it supposedly causes, in STORY-time — a causal
    //    impossibility (effect precedes cause). Compares coalesce(occursInChapter,
    //    chapter) so a flashback narrated later no longer collapses to same-chapter
    //    and legitimate cause→effect (earlier story-chapter → later) never fires.
    //    NOTE: for the seed to construct naturally, cross-chapter LEADS_TO edges
    //    must connect the SAME event nodes — event-name canonicalization on upsert
    //    (fix 7, separate lane) is still required so a retold "The Death of X" does
    //    not fork a duplicate node. The check itself is now correct and constructible.
    const timelineResult = await session.run(
      `MATCH (later:Event {bookId: $bookId})-[:LEADS_TO]->(earlier:Event {bookId: $bookId})
       WHERE coalesce(later.occursInChapter, later.chapter) > coalesce(earlier.occursInChapter, earlier.chapter)${userGuard("later")}
       RETURN later.name AS laterEvent, coalesce(later.occursInChapter, later.chapter) AS laterChapter,
              earlier.name AS earlierEvent, coalesce(earlier.occursInChapter, earlier.chapter) AS earlierChapter`,
      params
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
    //    RC-2 fix: compare STORY-time (coalesce(occursInChapter, chapter)), so a
    //    flashback / retelling narrated after the death (Event.chapter > death but
    //    occursInChapter <= death) no longer false-fires — the exact D-32(b) FP.
    const deadCharResult = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       WHERE c.status = "dead" AND c.deathChapter IS NOT NULL${userGuard("c")}
       MATCH (c)-[:PARTICIPATES_IN]->(e:Event {bookId: $bookId})
       WHERE coalesce(e.occursInChapter, e.chapter) > c.deathChapter
       RETURN c.name AS character, c.deathChapter AS deathChapter,
              collect(DISTINCT coalesce(e.occursInChapter, e.chapter)) AS postDeathChapters`,
      params
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
       AND p.resolvedChapter IS NULL${userGuard("p")}
       OPTIONAL MATCH (c:Chapter {bookId: $bookId})
       WITH p, max(c.chapterNumber) AS maxChapter
       WHERE maxChapter IS NOT NULL AND (maxChapter - p.introducedChapter) >= 3
       RETURN p.name AS thread, p.status AS status,
              p.introducedChapter AS introducedChapter, maxChapter`,
      params
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

    // 6. Relationship contradictions (RC-2 C1 / Fix 4): two characters marked as
    //    BOTH ALLIED_WITH and OPPOSES — but ONLY when both edges were asserted in
    //    the SAME chapter (r1.chapter = r2.chapter). A relationship that EVOLVES
    //    over time (allied in ch2, enemies by ch9) is a legitimate arc, not a
    //    contradiction; requiring co-assertion in one chapter stops the perpetual
    //    false flag the time-agnostic query produced (and that the D-30 cross-book
    //    contamination surfaced). Edge `.chapter` is application-stamped in
    //    upsertRelationship(), so it is always present on freshly written edges.
    const contradictionResult = await session.run(
      `MATCH (a:Character {bookId: $bookId})-[r1:ALLIED_WITH]-(b:Character {bookId: $bookId})
       WHERE id(a) < id(b)${userGuard("a")}
       MATCH (a)-[r2:OPPOSES]-(b)
       WHERE r1.chapter = r2.chapter
       RETURN a.name AS char1, b.name AS char2, r1.chapter AS chapter`,
      params
    );
    for (const rec of contradictionResult.records) {
      const chapter = rec.get("chapter") != null ? toNumber(rec.get("chapter")) : null;
      issues.push({
        type: "relationship_contradiction",
        severity: "major",
        description:
          chapter != null
            ? `Characters "${rec.get("char1")}" and "${rec.get("char2")}" are marked as both ALLIED_WITH and OPPOSES each other in chapter ${chapter}.`
            : `Characters "${rec.get("char1")}" and "${rec.get("char2")}" are marked as both ALLIED_WITH and OPPOSES each other simultaneously.`,
        entities: [rec.get("char1") as string, rec.get("char2") as string],
        chapters: chapter != null ? [chapter] : [],
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
