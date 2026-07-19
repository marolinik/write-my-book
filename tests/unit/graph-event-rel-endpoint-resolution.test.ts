import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * D-86 regression: Event relationship-endpoint canonical resolution.
 *
 * Root cause: `upsertRelationship` MATCHes its two endpoints by literal
 * `{name, bookId}` with no canonical/alias resolution. After sub-fix 7(a) folds
 * an Event variant onto a surviving node (e.g. "The Wedding" → stored "Wedding"),
 * a same-batch relationship that names the FOLDED-AWAY spelling ("The Wedding")
 * MATCHes nothing and the edge is SILENTLY DROPPED — losing the very LEADS_TO
 * timeline edges RC-3 needs to construct `timeline_violation`.
 *
 * Fix (see fix7c-handoff.md): resolve each EVENT endpoint through the SAME
 * canonical/article-variant lookup sub-fix (a) uses (canonicalName equality OR
 * article-variant name candidates, {bookId}-scoped, Event-only) BEFORE the
 * endpoint MATCH, so an edge naming a variant spelling attaches to the surviving
 * node. It NEVER creates a node for a non-existent endpoint and NEVER
 * cross-folds two distinct events; an endpoint that does not resolve keeps its
 * literal name (the MATCH simply finds nothing → edge not written → no crash).
 *
 * The fake Neo4j session is STORE-DRIVEN: the canonical lookup returns the real
 * surviving Event, and the relationship MERGE only creates an edge when BOTH
 * endpoints resolve to a stored node — so a dropped edge is a real dropped edge.
 */

type Params = Record<string, unknown>;
type NodeProps = Record<string, unknown> & { bookId: string; name: string };

const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Params }>,
  store: new Map<string, NodeProps>(), // key `label:bookId:name`
  edges: new Map<string, Record<string, unknown>>(), // `fromKey|TYPE|toKey`
}));

function byFirstAppearanceThenName(a: NodeProps, b: NodeProps): number {
  const fa = (a.firstAppearance as number) ?? Number.MAX_SAFE_INTEGER;
  const fb = (b.firstAppearance as number) ?? Number.MAX_SAFE_INTEGER;
  if (fa !== fb) return fa - fb;
  return String(a.name).localeCompare(String(b.name));
}

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        h.calls.push({ query, params });

        // ── Canonical Event lookup (sub-fix 7a entity path AND the D-86
        //    endpoint resolver share this exact query shape). ──
        if (
          query.includes("n.canonicalName = $canonicalName") &&
          query.includes("RETURN n.name AS existingName")
        ) {
          const canonicalName = params.canonicalName as string;
          const candidates = (params.nameCandidates as string[]) ?? [];
          const matches = [...h.store.entries()]
            .filter(
              ([key, v]) =>
                key.startsWith("Event:") &&
                v.bookId === params.bookId &&
                ((v.canonicalName as string) === canonicalName ||
                  candidates.includes(v.name))
            )
            .map(([, v]) => v)
            .sort(byFirstAppearanceThenName);
          if (matches.length > 0) {
            const existingName = matches[0].name;
            return {
              records: [
                { get: (k: string) => (k === "existingName" ? existingName : null) },
              ],
            };
          }
          return { records: [] as unknown[] };
        }

        // ── Alias-rename lookup: no aliases in these tests → no match. ──
        if (query.includes("WHERE n.name IN $aliases")) {
          return { records: [] as unknown[] };
        }

        // ── Entity MERGE ──
        const merge = query.match(
          /MERGE \(n:(\w+) \{bookId: \$bookId, name: \$name\}\)/
        );
        if (merge && query.includes("RETURN n.createdAt = n.updatedAt AS isNew")) {
          const label = merge[1];
          const key = `${label}:${String(params.bookId)}:${String(params.name)}`;
          const existing = h.store.get(key);
          const merged: NodeProps = existing
            ? { ...existing, ...(params.updateProps as Params) }
            : {
                ...(params.createProps as Params),
                firstAppearance: params.chapter,
                bookId: params.bookId as string,
                name: params.name as string,
              };
          h.store.set(key, merged);
          return {
            records: [{ get: (k: string) => (k === "isNew" ? !existing : null) }],
          };
        }

        // ── Relationship MATCH...MERGE: edge only when BOTH endpoints resolve to
        //    a stored node (literal {name, bookId, label}). ──
        const relMerge = query.match(
          /MATCH \(a:(\w+) \{[^}]+\}\)\s+MATCH \(b:(\w+) \{[^}]+\}\)\s+MERGE \(a\)-\[r:(\w+)\]->\(b\)/
        );
        if (relMerge) {
          const [, aLabel, bLabel, relType] = relMerge;
          const aKey = `${aLabel}:${String(params.bookId)}:${String(params.fromName)}`;
          const bKey = `${bLabel}:${String(params.bookId)}:${String(params.toName)}`;
          const aExists = h.store.has(aKey);
          const bExists = h.store.has(bKey);
          if (aExists && bExists) {
            const edgeKey = `${aKey}|${relType}|${bKey}`;
            const existing = h.edges.get(edgeKey);
            h.edges.set(
              edgeKey,
              existing
                ? { ...existing, ...(params.props as Params) }
                : { ...(params.props as Params), createdAt: "«created»" }
            );
            return { records: [{ get: () => null }] };
          }
          return { records: [] as unknown[] };
        }

        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import { upsertEntities } from "@/lib/graph/graph-builder";
import type { ExtractionResult, GraphNodeLabel } from "@/lib/graph/types";

const ev = (name: string): { name: string; label: GraphNodeLabel; properties: Params } => ({
  name,
  label: "Event",
  properties: { bookId: "b1" },
});

const edgeExists = (fromKey: string, type: string, toKey: string) =>
  h.edges.has(`${fromKey}|${type}|${toKey}`);
const allEdges = () => [...h.edges.keys()];

function run(
  entities: ExtractionResult["entities"],
  relationships: ExtractionResult["relationships"]
) {
  return upsertEntities({
    bookId: "b1",
    entities,
    relationships,
    chapterNumber: 4,
    contentHash: "0000000000000000",
  });
}

beforeEach(() => {
  h.calls.length = 0;
  h.store.clear();
  h.edges.clear();
});

describe("Event relationship-endpoint canonical resolution (D-86)", () => {
  it("(d86-1) an edge naming a variant spelling ('The Wedding') attaches to the surviving 'Wedding' node instead of being dropped", async () => {
    const stats = await run(
      [ev("Wedding"), ev("Reception")],
      [
        {
          from: "The Wedding",
          fromLabel: "Event",
          to: "Reception",
          toLabel: "Event",
          type: "LEADS_TO",
          properties: {},
        },
      ]
    );
    expect(edgeExists("Event:b1:Wedding", "LEADS_TO", "Event:b1:Reception")).toBe(true);
    expect(stats.relationshipsCreated).toBe(1);
  });

  it("(d86-2) the reverse fold also resolves: an endpoint 'Wedding' attaches to the stored 'The Wedding' node", async () => {
    const stats = await run(
      [ev("The Wedding"), ev("Aftermath")],
      [
        {
          from: "Aftermath",
          fromLabel: "Event",
          to: "Wedding",
          toLabel: "Event",
          type: "LEADS_TO",
          properties: {},
        },
      ]
    );
    expect(
      edgeExists("Event:b1:Aftermath", "LEADS_TO", "Event:b1:The Wedding")
    ).toBe(true);
    expect(stats.relationshipsCreated).toBe(1);
  });

  it("(d86-3) a relationship to a genuinely-unknown endpoint does NOT falsely attach (no cross-fold, no invented node)", async () => {
    const stats = await run(
      [ev("Wedding")],
      [
        {
          from: "Wedding",
          fromLabel: "Event",
          to: "The Funeral", // no Funeral event exists (canonical "Funeral" ≠ "Wedding")
          toLabel: "Event",
          type: "LEADS_TO",
          properties: {},
        },
      ]
    );
    expect(allEdges()).toEqual([]);
    expect(stats.relationshipsCreated).toBe(0);
  });

  it("(d86-4) resolution is Event-SCOPED: a Character endpoint is matched literally (no canonical fold for Characters)", async () => {
    const stats = await run(
      [
        { name: "The Prophet", label: "Character", properties: { bookId: "b1", status: "alive" } },
        ev("Ritual"),
      ],
      [
        {
          from: "The Prophet",
          fromLabel: "Character",
          to: "Ritual",
          toLabel: "Event",
          type: "PARTICIPATES_IN",
          properties: {},
        },
      ]
    );
    expect(
      edgeExists("Character:b1:The Prophet", "PARTICIPATES_IN", "Event:b1:Ritual")
    ).toBe(true);
    expect(stats.relationshipsCreated).toBe(1);
    // No Event canonical lookup was issued for the Character endpoint "The Prophet".
    const charCanonicalLookup = h.calls.find(
      (c) =>
        c.query.includes("n.canonicalName = $canonicalName") &&
        c.query.includes("MATCH (n:Character")
    );
    expect(charCanonicalLookup).toBeUndefined();
  });

  it("(d86-5) the endpoint resolver rides values as params and its MATCH is Event-scoped + parameterized", async () => {
    const injection = 'Wedding"}) DETACH DELETE n //';
    await run(
      [ev("Wedding")],
      [
        {
          from: injection,
          fromLabel: "Event",
          to: "Wedding",
          toLabel: "Event",
          type: "LEADS_TO",
          properties: {},
        },
      ]
    );
    // The endpoint resolver issued a lookup carrying the malicious spelling as a
    // PARAM value (identified by that payload in nameCandidates — the entity
    // canonical lookup shares the query shape but never carries this value).
    const resolverLookup = h.calls.find(
      (c) =>
        c.query.includes("MATCH (n:Event {bookId: $bookId})") &&
        c.query.includes("RETURN n.name AS existingName") &&
        c.query.includes("n.canonicalName = $canonicalName") &&
        Array.isArray(c.params.nameCandidates) &&
        (c.params.nameCandidates as string[]).includes(injection)
    );
    expect(resolverLookup).toBeDefined();
    // the malicious spelling is a param value, never interpolated into Cypher
    expect(resolverLookup!.query).not.toContain("DETACH DELETE");
  });
});
