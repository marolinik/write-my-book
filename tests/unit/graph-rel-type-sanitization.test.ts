import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * D-63 regression: the relationship `type` reaching
 * `MERGE (a)-[r:${type}]->(b)` in graph-builder was interpolated RAW. Node
 * labels pass through escapeLabelForQuery(); the relationship type did not.
 *
 * `type` is fully LLM-controlled — the agent UpdateGraphEntity tool declares it
 * a free string and the `as RelationshipType` cast is a runtime no-op — so a
 * crafted value breaks out of the relationship pattern and runs attacker Cypher
 * across every tenant's graph:
 *
 *   KNOWS]->(b) WITH a MATCH (n) DETACH DELETE n //
 *
 * Fix contract (asserted here):
 *   1. sanitizeRelationshipType() reduces any input to a bare Cypher identifier
 *      matching /^[A-Za-z0-9_]+$/ — no brackets, spaces, or comment markers.
 *   2. Known relationship types round-trip to their canonical union form (so the
 *      continuity checks that key off ":ALLIED_WITH" etc. still match).
 *   3. Empty / all-symbol input never yields "" — it falls back to a safe
 *      constant.
 *   4. Behaviourally: the MERGE emitted by upsertRelationship carries only the
 *      sanitized type, so the injection payload cannot appear in the query.
 */

const INJECTION = "KNOWS]->(b) WITH a MATCH (n) DETACH DELETE n //";
const IDENTIFIER = /^[A-Za-z0-9_]+$/;

// ── Query-capturing Neo4j mock (no behaviour, just records the Cypher run) ──
const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Record<string, unknown> }>,
}));

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Record<string, unknown> = {}) => {
        h.calls.push({ query, params });
        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import {
  sanitizeRelationshipType,
  upsertEntities,
} from "@/lib/graph/graph-builder";
import { RELATIONSHIP_TYPES } from "@/lib/graph/types";
import type { ExtractionResult } from "@/lib/graph/types";

const BOOK = "book-d63";

function extractionWithRelType(type: string): ExtractionResult {
  return {
    bookId: BOOK,
    entities: [],
    relationships: [
      {
        from: "Sarah",
        fromLabel: "Character",
        to: "John",
        toLabel: "Character",
        // Runtime-untrusted value; the compile-time cast is a no-op.
        type: type as ExtractionResult["relationships"][number]["type"],
        properties: {},
      },
    ],
    chapterNumber: 6,
    contentHash: "0000000000000000",
  };
}

const relMergeQuery = () =>
  h.calls.find((c) => c.query.includes("MERGE (a)-[r:"))?.query;

/** The type token interpolated into `MERGE (a)-[r:<token>]->(b)`. */
function emittedRelType(query: string): string | undefined {
  return query.match(/-\[r:([^\]]*)\]->/)?.[1];
}

beforeEach(() => {
  h.calls.length = 0;
});

describe("sanitizeRelationshipType (D-63)", () => {
  it("reduces the injection payload to a bare identifier — no brackets/spaces/comment", () => {
    const out = sanitizeRelationshipType(INJECTION);
    expect(out).toMatch(IDENTIFIER);
    expect(out).not.toContain("]");
    expect(out).not.toContain(" ");
    expect(out).not.toContain("//");
    expect(out).not.toContain("(");
  });

  it("round-trips every known relationship type to its canonical union form", () => {
    for (const canonical of RELATIONSHIP_TYPES) {
      expect(sanitizeRelationshipType(canonical)).toBe(canonical);
    }
  });

  it("canonicalizes case/whitespace variants of a known type (continuity keys stay intact)", () => {
    expect(sanitizeRelationshipType("allied_with")).toBe("ALLIED_WITH");
    expect(sanitizeRelationshipType("  Knows  ")).toBe("KNOWS");
    expect(sanitizeRelationshipType("Opposes")).toBe("OPPOSES");
  });

  it("preserves a benign hallucinated type as a valid identifier", () => {
    expect(sanitizeRelationshipType("MARRIED_TO")).toBe("MARRIED_TO");
    expect(sanitizeRelationshipType("loves")).toBe("LOVES");
    // symbols collapse away but the token survives as an identifier
    expect(sanitizeRelationshipType("is-friend-of")).toBe("ISFRIENDOF");
  });

  it("never returns empty — empty / all-symbol / whitespace fall back to a safe constant", () => {
    for (const bad of ["", "   ", "()[]//", "-->", "]->(b)"]) {
      const out = sanitizeRelationshipType(bad);
      expect(out.length).toBeGreaterThan(0);
      expect(out).toMatch(IDENTIFIER);
    }
  });

  it("emits a Cypher-valid bare identifier for numeric-leading input", () => {
    const out = sanitizeRelationshipType("7_BONDS");
    expect(out).toMatch(IDENTIFIER);
    expect(out).toMatch(/^[A-Za-z_]/); // bare Neo4j identifiers cannot start with a digit
  });

  it("tolerates non-string input without throwing", () => {
    for (const bad of [undefined, null, 123, {}, []]) {
      const out = sanitizeRelationshipType(bad as unknown);
      expect(out.length).toBeGreaterThan(0);
      expect(out).toMatch(IDENTIFIER);
    }
  });
});

describe("upsertRelationship interpolates only the sanitized type (D-63)", () => {
  it("the injection payload cannot survive into the emitted MERGE", async () => {
    await upsertEntities(extractionWithRelType(INJECTION));

    const query = relMergeQuery();
    expect(query).toBeDefined();
    // The whole rel query must not carry the breakout clauses.
    expect(query).not.toContain("DETACH DELETE");
    expect(query).not.toContain("//");
    // And the interpolated type is a bare identifier equal to the sanitizer output.
    const token = emittedRelType(query!);
    expect(token).toBeDefined();
    expect(token).toMatch(IDENTIFIER);
    expect(token).toBe(sanitizeRelationshipType(INJECTION));
  });

  it("a known type is emitted canonically (ALLIED_WITH preserved for continuity checks)", async () => {
    await upsertEntities(extractionWithRelType("allied_with"));

    const query = relMergeQuery();
    expect(query).toBeDefined();
    expect(emittedRelType(query!)).toBe("ALLIED_WITH");
  });
});
