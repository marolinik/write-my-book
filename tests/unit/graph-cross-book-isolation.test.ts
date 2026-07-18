import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * D-30 regression: upsertRelationship() MATCHed its two endpoint nodes by
 * NAME ONLY (`MATCH (a:Label {name: $fromName})`) with just a relative
 * `WHERE a.bookId = b.bookId` — the CALLING book's id was never bound. Cypher
 * therefore produced the full cross-product of same-named node pairs across
 * ALL books (including other users' books — cross-tenant), and MERGE wrote or
 * overwrote a relationship edge on EVERY pair. Empirically proven in the QA
 * campaign: book1 (chapters 1-5 only) carried ALLIED_WITH r.chapter=6 /
 * OPPOSES r.chapter=9 edges byte-identical (updatedAt) to book2's, producing
 * an active false relationship_contradiction flag on a book whose prose
 * contains no contradiction.
 *
 * Fix contract (asserted here):
 *   1. The generated relationship Cypher binds `bookId: $bookId` on BOTH
 *      endpoint MATCHes and passes the calling book's id as $bookId.
 *   2. Behaviourally: extracting into book A creates/updates edges ONLY
 *      between book A's nodes — a same-named pair in book B keeps its edge
 *      set and edge properties bit-for-bit unchanged.
 *
 * The fake Neo4j session below mirrors real MERGE/MATCH semantics DRIVEN BY
 * THE QUERY TEXT: if the query binds bookId on an endpoint, candidates are
 * filtered to $bookId; if it only carries the relative WHERE, the fake
 * faithfully reproduces the cross-book cross-product — so the behavioural
 * assertions genuinely fail on the pre-fix query shape rather than being
 * masked by a lenient emulation.
 */

type Params = Record<string, unknown>;
type NodeProps = Record<string, unknown> & { bookId: string; name: string };

const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Params }>,
  /** key `label:bookId:name` → node properties */
  nodes: new Map<string, Record<string, unknown>>(),
  /** key `fromKey|TYPE|toKey` → edge properties */
  edges: new Map<string, Record<string, unknown>>(),
}));

function nodeMatches(
  key: string,
  props: Record<string, unknown>,
  label: string,
  name: unknown,
  mapText: string,
  params: Params
): boolean {
  if (!key.startsWith(`${label}:`)) return false;
  if (props.name !== name) return false;
  // Query-text-driven: only filter by book when the Cypher actually binds it.
  if (mapText.includes("bookId: $bookId") && props.bookId !== params.bookId) {
    return false;
  }
  return true;
}

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        h.calls.push({ query, params });

        // ── Entity MERGE (same emulation as continuity-graph-properties) ──
        const nodeMerge = query.match(
          /MERGE \(n:(\w+) \{bookId: \$bookId, name: \$name\}\)/
        );
        if (nodeMerge && query.includes("RETURN n.createdAt = n.updatedAt AS isNew")) {
          const key = `${nodeMerge[1]}:${String(params.bookId)}:${String(params.name)}`;
          const existing = h.nodes.get(key);
          const merged: Record<string, unknown> = existing
            ? { ...existing, ...(params.updateProps as Params) }
            : {
                ...(params.createProps as Params),
                firstAppearance: params.chapter,
              };
          merged.bookId = params.bookId;
          merged.name = params.name;
          h.nodes.set(key, merged);
          return { records: [{ get: (k: string) => (k === "isNew" ? !existing : null) }] };
        }

        // ── Relationship MERGE: two endpoint MATCHes then MERGE (a)-[r]->(b) ──
        const relMerge = query.match(
          /MATCH \(a:(\w+) \{([^}]+)\}\)\s+MATCH \(b:(\w+) \{([^}]+)\}\)\s+(WHERE a\.bookId = b\.bookId\s+)?MERGE \(a\)-\[r:(\w+)\]->\(b\)/
        );
        if (relMerge) {
          const [, aLabel, aMap, bLabel, bMap, relativeWhere, relType] = relMerge;
          const entries = [...h.nodes.entries()] as Array<[string, NodeProps]>;
          const aCandidates = entries.filter(([k, v]) =>
            nodeMatches(k, v, aLabel, params.fromName, aMap, params)
          );
          const bCandidates = entries.filter(([k, v]) =>
            nodeMatches(k, v, bLabel, params.toName, bMap, params)
          );
          const records: unknown[] = [];
          for (const [aKey, aProps] of aCandidates) {
            for (const [bKey, bProps] of bCandidates) {
              if (relativeWhere && aProps.bookId !== bProps.bookId) continue;
              const edgeKey = `${aKey}|${relType}|${bKey}`;
              const existing = h.edges.get(edgeKey);
              h.edges.set(
                edgeKey,
                existing
                  ? { ...existing, ...(params.props as Params) } // ON MATCH SET r += $props
                  : { ...(params.props as Params), createdAt: "«created»" } // ON CREATE
              );
              records.push({ get: () => null });
            }
          }
          return { records };
        }

        // alias-lookup and any other read: no matches
        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import { upsertEntities } from "@/lib/graph/graph-builder";
import type { ExtractionResult } from "@/lib/graph/types";

const BOOK_A = "book-a-fd60e1d4";
const BOOK_B = "book-b-other-tenant";

/** Seed a node directly (simulates another book/tenant's pre-existing graph). */
function seedNode(label: string, bookId: string, name: string, extra: Params = {}) {
  h.nodes.set(`${label}:${bookId}:${name}`, { bookId, name, ...extra });
}

function extraction(over: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    bookId: BOOK_A,
    entities: [],
    relationships: [],
    chapterNumber: 6,
    contentHash: "0000000000000000",
    ...over,
  };
}

/** The extraction under test: book A's chapter 6 allies Sarah with John Miller. */
function bookAExtraction(): ExtractionResult {
  return extraction({
    chapterNumber: 6,
    entities: [
      {
        name: "Sarah",
        label: "Character",
        properties: { bookId: BOOK_A, role: "protagonist", status: "alive" },
      },
      {
        name: "John Miller",
        label: "Character",
        properties: { bookId: BOOK_A, role: "supporting", status: "alive" },
      },
    ],
    relationships: [
      {
        from: "Sarah",
        fromLabel: "Character",
        to: "John Miller",
        toLabel: "Character",
        type: "ALLIED_WITH",
        properties: { context: "siege of Emberfall" },
      },
    ],
  });
}

const relationshipCalls = () =>
  h.calls.filter((c) => c.query.includes("MERGE (a)-[r:"));

beforeEach(() => {
  h.calls.length = 0;
  h.nodes.clear();
  h.edges.clear();
});

describe("upsertRelationship binds the calling book on BOTH endpoints (D-30)", () => {
  it("generated Cypher carries bookId: $bookId in each endpoint MATCH and passes the calling book id", async () => {
    await upsertEntities(bookAExtraction());

    const rel = relationshipCalls()[0];
    expect(rel).toBeDefined();
    // Both endpoint MATCH property maps must bind the book.
    expect(rel.query).toMatch(
      /MATCH \(a:Character \{[^}]*bookId: \$bookId[^}]*\}\)/
    );
    expect(rel.query).toMatch(
      /MATCH \(b:Character \{[^}]*bookId: \$bookId[^}]*\}\)/
    );
    // And the parameter must be the CALLING book's id.
    expect(rel.params.bookId).toBe(BOOK_A);
    // Name params still bound as before.
    expect(rel.params.fromName).toBe("Sarah");
    expect(rel.params.toName).toBe("John Miller");
  });

  it("creates the edge in the calling book and counts it", async () => {
    const stats = await upsertEntities(bookAExtraction());

    expect(stats.relationshipsCreated).toBe(1);
    const edge = h.edges.get(
      `Character:${BOOK_A}:Sarah|ALLIED_WITH|Character:${BOOK_A}:John Miller`
    );
    expect(edge).toBeDefined();
    expect(edge?.chapter).toBe(6);
  });

  it("a same-named pair in ANOTHER book (other tenant) gets NO new edge (D-30 repro)", async () => {
    // Another user's book contains the same author-chosen character names —
    // inevitable collisions ("Sarah", "John Miller") across tenants.
    seedNode("Character", BOOK_B, "Sarah", { role: "minor", status: "alive" });
    seedNode("Character", BOOK_B, "John Miller", { role: "minor", status: "alive" });

    await upsertEntities(bookAExtraction());

    // Book A got its edge…
    expect(
      h.edges.has(`Character:${BOOK_A}:Sarah|ALLIED_WITH|Character:${BOOK_A}:John Miller`)
    ).toBe(true);
    // …book B got NOTHING. Pre-fix, the name-only MATCH + relative WHERE
    // produced the cross-product and MERGEd an ALLIED_WITH chapter=6 edge here.
    expect(
      h.edges.has(`Character:${BOOK_B}:Sarah|ALLIED_WITH|Character:${BOOK_B}:John Miller`)
    ).toBe(false);
    const bookBEdges = [...h.edges.keys()].filter((k) => k.includes(BOOK_B));
    expect(bookBEdges).toEqual([]);
  });

  it("an EXISTING edge between the same-named pair in another book keeps its properties bit-for-bit (no ON MATCH overwrite)", async () => {
    // Book B legitimately allied the pair back in ITS chapter 2. The QA
    // evidence for D-30 was precisely this overwrite: victim-book edges with
    // r.chapter/updatedAt byte-identical to the source book's write.
    seedNode("Character", BOOK_B, "Sarah", { status: "alive" });
    seedNode("Character", BOOK_B, "John Miller", { status: "alive" });
    const bookBEdgeKey = `Character:${BOOK_B}:Sarah|ALLIED_WITH|Character:${BOOK_B}:John Miller`;
    const originalProps = {
      chapter: 2,
      updatedAt: "2026-07-01T00:00:00.000Z",
      context: "book B's own alliance",
      createdAt: "«created»",
    };
    h.edges.set(bookBEdgeKey, { ...originalProps });

    await upsertEntities(bookAExtraction());

    expect(h.edges.get(bookBEdgeKey)).toEqual(originalProps);
  });

  it("does not write any relationship when the extraction carries no bookId (defense in depth)", async () => {
    seedNode("Character", BOOK_B, "Sarah", {});
    seedNode("Character", BOOK_B, "John Miller", {});
    const result = bookAExtraction();
    // Simulate a legacy/buggy caller that lost the book scope.
    (result as { bookId?: string }).bookId = undefined;

    const stats = await upsertEntities(result);

    expect(stats.relationshipsCreated).toBe(0);
    const bookBEdges = [...h.edges.keys()].filter((k) => k.includes(BOOK_B));
    expect(bookBEdges).toEqual([]);
  });
});
