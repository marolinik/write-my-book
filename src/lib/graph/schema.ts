/**
 * Graph schema initialization: creates constraints and indexes via Cypher.
 * Should be run once on application startup or deployment.
 */

import { withSession } from "./neo4j-client";

const CONSTRAINTS = [
  // Unique constraints on (bookId, name) for each node type
  `CREATE CONSTRAINT character_unique IF NOT EXISTS FOR (c:Character) REQUIRE (c.bookId, c.name) IS UNIQUE`,
  `CREATE CONSTRAINT location_unique IF NOT EXISTS FOR (l:Location) REQUIRE (l.bookId, l.name) IS UNIQUE`,
  `CREATE CONSTRAINT event_unique IF NOT EXISTS FOR (e:Event) REQUIRE (e.bookId, e.name) IS UNIQUE`,
  `CREATE CONSTRAINT object_unique IF NOT EXISTS FOR (o:Object) REQUIRE (o.bookId, o.name) IS UNIQUE`,
  `CREATE CONSTRAINT plotthread_unique IF NOT EXISTS FOR (p:PlotThread) REQUIRE (p.bookId, p.name) IS UNIQUE`,
  `CREATE CONSTRAINT chapter_unique IF NOT EXISTS FOR (c:Chapter) REQUIRE (c.bookId, c.chapterNumber) IS UNIQUE`,
  `CREATE CONSTRAINT faction_unique IF NOT EXISTS FOR (f:Faction) REQUIRE (f.bookId, f.name) IS UNIQUE`,
  `CREATE CONSTRAINT scene_unique IF NOT EXISTS FOR (s:Scene) REQUIRE (s.bookId, s.chapterNumber, s.sceneIndex) IS UNIQUE`,
];

const INDEXES = [
  // Lookup indexes for common query patterns
  `CREATE INDEX character_bookId IF NOT EXISTS FOR (c:Character) ON (c.bookId)`,
  `CREATE INDEX location_bookId IF NOT EXISTS FOR (l:Location) ON (l.bookId)`,
  `CREATE INDEX event_bookId IF NOT EXISTS FOR (e:Event) ON (e.bookId)`,
  `CREATE INDEX event_chapter IF NOT EXISTS FOR (e:Event) ON (e.chapter)`,
  `CREATE INDEX object_bookId IF NOT EXISTS FOR (o:Object) ON (o.bookId)`,
  `CREATE INDEX plotthread_bookId IF NOT EXISTS FOR (p:PlotThread) ON (p.bookId)`,
  `CREATE INDEX plotthread_status IF NOT EXISTS FOR (p:PlotThread) ON (p.status)`,
  `CREATE INDEX chapter_bookId IF NOT EXISTS FOR (c:Chapter) ON (c.bookId)`,
  `CREATE INDEX faction_bookId IF NOT EXISTS FOR (f:Faction) ON (f.bookId)`,
  `CREATE INDEX scene_bookId IF NOT EXISTS FOR (s:Scene) ON (s.bookId)`,
  // Full-text search index on character names and aliases
  `CREATE FULLTEXT INDEX character_name_search IF NOT EXISTS FOR (c:Character) ON EACH [c.name]`,
];

/**
 * Initialize the graph schema: create all constraints and indexes.
 * Safe to call multiple times (uses IF NOT EXISTS).
 */
export async function initGraphSchema(): Promise<void> {
  await withSession("WRITE", async (session) => {
    for (const constraint of CONSTRAINTS) {
      await session.run(constraint);
    }
    for (const index of INDEXES) {
      await session.run(index);
    }
  });
}

/**
 * Drop all data for a specific book (used for cleanup/reset).
 */
export async function clearBookGraph(bookId: string): Promise<void> {
  await withSession("WRITE", async (session) => {
    await session.run(
      `MATCH (n {bookId: $bookId}) DETACH DELETE n`,
      { bookId }
    );
  });
}
