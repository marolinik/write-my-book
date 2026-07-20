import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * fix 7 sub-fix (d) — reified death Event anchor (DIES_IN edge).
 *
 * GAP (registered as the fix-7(d) residual in fix7d-deferral.md): death is only a
 * SCALAR (`Character.deathChapter`), never a reified event, so the graph cannot
 * answer "in which scene/event did X die" nor carry death circumstances. This fix
 * ADDS — additively, without disturbing the monotonic deathChapter coalesce — a
 * reified death Event node plus a `DIES_IN` edge from the Character to it, anchored
 * to the chapter the death was first observed. Both use first-write-wins coalesce
 * so a later re-scan cannot churn the anchor (mirrors deathChapter's own
 * monotonicity / D-79 stability).
 *
 * The fake Neo4j session below is STORE-DRIVEN and models the death-Event MERGE +
 * DIES_IN edge with REAL coalesce semantics, so the RED→GREEN difference is purely
 * in graph-builder emitting the new shape, not in a lenient mock. The main entity
 * MERGE keeps the exact `RETURN n.createdAt = n.updatedAt AS isNew` shape the other
 * graph suites rely on (so death-anchor calls never inflate their mergeCalls()).
 */

type Params = Record<string, unknown>;
type NodeProps = Record<string, unknown>;
interface Edge {
  fromName: string;
  type: string;
  toName: string;
  props: NodeProps;
}

const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Params }>,
  store: new Map<string, NodeProps>(), // key `label:bookId:name`
  edges: [] as Edge[],
}));

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        h.calls.push({ query, params });

        // ── dead_character_reappears (graph-queries.ts:438-446): serve the REAL
        //    consistency-check predicate from the store so d7 exercises it for
        //    real (not a replicated stub). A dead character with deathChapter set
        //    is flagged iff it PARTICIPATES_IN an Event whose story-time
        //    (coalesce(occursInChapter, chapter)) is strictly AFTER the death. ──
        if (query.includes("postDeathChapters")) {
          const bookId = String(params.bookId);
          const records: Array<{
            character: string;
            deathChapter: number;
            postDeathChapters: number[];
          }> = [];
          for (const [key, c] of h.store.entries()) {
            if (!key.startsWith("Character:")) continue;
            if (String(c.bookId) !== bookId) continue;
            if (c.status !== "dead" || c.deathChapter == null) continue;
            const deathChapter = c.deathChapter as number;
            const post = h.edges
              .filter((e) => e.type === "PARTICIPATES_IN" && e.fromName === c.name)
              .map((e) => h.store.get(`Event:${bookId}:${e.toName}`))
              .filter((ev): ev is NodeProps => ev != null)
              .map((ev) => (ev.occursInChapter ?? ev.chapter) as number)
              .filter((ch) => typeof ch === "number" && ch > deathChapter);
            if (post.length > 0) {
              records.push({
                character: String(c.name),
                deathChapter,
                postDeathChapters: [...new Set(post)],
              });
            }
          }
          return {
            records: records.map((r) => ({
              get: (k: string) => (r as Record<string, unknown>)[k] ?? null,
            })),
          };
        }

        // ── Reified death Event MERGE (sub-fix d). Chapter-INDEPENDENT identity
        //    keyed per character, so re-scans converge; occursInChapter/chapter
        //    are first-write-wins coalesced (monotonic anchor). ──
        if (query.includes("MERGE (d:Event {bookId: $bookId, name: $deathEventName})")) {
          const key = `Event:${String(params.bookId)}:${String(params.deathEventName)}`;
          const existing = h.store.get(key);
          const chapter = params.chapter as number;
          const merged: NodeProps = existing
            ? {
                ...existing,
                // ON MATCH: coalesce keeps the earliest anchor; refresh lastMentioned.
                chapter: existing.chapter ?? chapter,
                // FP-A: query-text-driven so a revert of the source one-liner is
                // genuinely caught. The CORRECTED clause backfills story-time from
                // the node's OWN narrating chapter first (coalesce(occursInChapter,
                // chapter, $chapter)); the naive pre-fix clause invented $chapter.
                occursInChapter: query.includes(
                  "coalesce(d.occursInChapter, d.chapter, $chapter)"
                )
                  ? existing.occursInChapter ?? existing.chapter ?? chapter
                  : existing.occursInChapter ?? chapter,
                eventType: "death",
                deathOf: existing.deathOf ?? params.characterName,
                lastMentioned: chapter,
              }
            : {
                // ON CREATE
                bookId: params.bookId,
                name: params.deathEventName,
                firstAppearance: chapter,
                chapter,
                occursInChapter: chapter,
                canonicalName: params.canonical,
                significance: "major",
                eventType: "death",
                deathOf: params.characterName,
                ...(params.userId ? { userId: params.userId } : {}),
              };
          h.store.set(key, merged);
          return { records: [{ get: (k: string) => (k === "name" ? merged.name : null) }] };
        }

        // ── DIES_IN edge MERGE (sub-fix d): Character -> death Event, monotonic. ──
        if (query.includes("MERGE (c)-[r:DIES_IN]->(d)")) {
          const fromName = String(params.characterName);
          const toName = String(params.deathEventName);
          const chapter = params.chapter as number;
          const existing = h.edges.find(
            (e) => e.type === "DIES_IN" && e.fromName === fromName && e.toName === toName
          );
          if (existing) {
            // ON MATCH: coalesce chapter (first-write-wins).
            existing.props.chapter = existing.props.chapter ?? chapter;
          } else {
            h.edges.push({
              fromName,
              type: "DIES_IN",
              toName,
              props: { chapter },
            });
          }
          return { records: [{ get: () => null }] };
        }

        // ── Alias-rename lookup (no aliases in these tests → empty). ──
        if (query.includes("WHERE n.name IN $aliases")) {
          return { records: [] as unknown[] };
        }

        // ── Main entity MERGE (character). Faithful create/match + deathChapter
        //    coalesce so the monotonic scalar stays exercised alongside the edge. ──
        const merge = query.match(/MERGE \(n:(\w+) \{bookId: \$bookId, name: \$name\}\)/);
        if (merge && query.includes("RETURN n.createdAt = n.updatedAt AS isNew")) {
          const label = merge[1];
          const key = `${label}:${String(params.bookId)}:${String(params.name)}`;
          const existing = h.store.get(key);
          let merged: NodeProps;
          if (!existing) {
            merged = {
              ...(params.createProps as Params),
              firstAppearance: params.chapter,
              bookId: params.bookId,
              name: params.name,
            };
          } else {
            merged = { ...existing, ...(params.updateProps as Params) };
            if (query.includes("n.deathChapter = coalesce(n.deathChapter, $chapter)")) {
              merged.deathChapter = existing.deathChapter ?? params.chapter;
            }
            if (
              query.includes(
                'n.status = CASE WHEN n.status = "dead" THEN n.status ELSE $incomingStatus END'
              )
            ) {
              merged.status =
                existing.status === "dead" ? existing.status : params.incomingStatus;
            } else if (query.includes("n.status = $incomingStatus")) {
              merged.status = params.incomingStatus;
            }
          }
          h.store.set(key, merged);
          return {
            records: [{ get: (k: string) => (k === "isNew" ? !existing : null) }],
          };
        }

        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import { upsertEntities } from "@/lib/graph/graph-builder";
import { runConsistencyChecks } from "@/lib/graph/graph-queries";
import type { ExtractionResult } from "@/lib/graph/types";

const deathEvent = (bookId: string, characterName: string): NodeProps | undefined =>
  h.store.get(`Event:${bookId}:Death of ${characterName}`);

const diesInEdge = (characterName: string): Edge | undefined =>
  h.edges.find((e) => e.type === "DIES_IN" && e.fromName === characterName);

const character = (name: string, status: string) => ({
  name,
  label: "Character" as const,
  properties: { bookId: "b1", status, role: "supporting" },
});

function extraction(over: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    bookId: "b1",
    entities: [],
    relationships: [],
    chapterNumber: 7,
    contentHash: "0000000000000000",
    ...over,
  };
}

beforeEach(() => {
  h.calls.length = 0;
  h.store.clear();
  h.edges.length = 0;
});

describe("fix 7(d): reified death Event + DIES_IN edge (additive, monotonic)", () => {
  it("(d1) a death produces a reified death Event anchored to the death chapter", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 5, entities: [character("Corvin", "dead")] })
    );

    const evt = deathEvent("b1", "Corvin");
    expect(evt).toBeDefined();
    expect(evt!.eventType).toBe("death");
    expect(evt!.deathOf).toBe("Corvin");
    // anchored to the chapter the death was observed (story-time == narrating here)
    expect(evt!.occursInChapter).toBe(5);
    expect(evt!.chapter).toBe(5);
  });

  it("(d2) a DIES_IN edge links the Character to its death Event at the death chapter", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 5, entities: [character("Corvin", "dead")] })
    );
    const edge = diesInEdge("Corvin");
    expect(edge).toBeDefined();
    expect(edge!.toName).toBe("Death of Corvin");
    expect(edge!.props.chapter).toBe(5);
  });

  it("(d3) the death Event anchor is MONOTONIC: a later dead re-scan does NOT move it (earliest observed wins)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 3, entities: [character("Corvin", "dead")] })
    ); // first observed dead → anchor 3
    await upsertEntities(
      extraction({ chapterNumber: 9, entities: [character("Corvin", "dead")] })
    ); // later re-scan must not churn the anchor

    const evt = deathEvent("b1", "Corvin");
    expect(evt!.occursInChapter).toBe(3);
    expect(evt!.chapter).toBe(3);
    expect(diesInEdge("Corvin")!.props.chapter).toBe(3);
    // and the scalar deathChapter stays monotonic in lock-step (do NOT regress D-79)
    expect((h.store.get("Character:b1:Corvin") as NodeProps).deathChapter).toBe(3);
  });

  it("(d4) a LIVING character produces NO death Event and NO DIES_IN edge (additive: only deaths reify)", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 4, entities: [character("Vera", "alive")] })
    );
    expect(deathEvent("b1", "Vera")).toBeUndefined();
    expect(diesInEdge("Vera")).toBeUndefined();
    // no DIES_IN query was even issued
    expect(h.calls.some((c) => c.query.includes("DIES_IN"))).toBe(false);
  });

  it("(d5) the reified death anchor never trips dead_character_reappears: it uses DIES_IN (not PARTICIPATES_IN) and occursInChapter == deathChapter, not >", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 6, entities: [character("Halden", "dead")] })
    );
    const evt = deathEvent("b1", "Halden")!;
    // the death event occurs IN the death chapter, never after it
    expect(evt.occursInChapter).toBe(6);
    // the character links to it via DIES_IN, not the participation edge the
    // reappearance check reads
    const edge = diesInEdge("Halden")!;
    expect(edge.type).toBe("DIES_IN");
  });

  it("(d7) ON MATCH onto a PRE-EXISTING same-name LLM Event does NOT invent a later story-time (FP-A): no dead_character_reappears false flag, occursInChapter stays at the legacy narrating chapter", async () => {
    // Legacy / pre-RC-2 population the FP-A guard exists for: a real LLM-extracted
    // Event "Death of Elena" {chapter:2, occursInChapter:null} that Elena naturally
    // PARTICIPATES_IN, with Character.deathChapter=2. The death anchor MERGEs on the
    // exact same name, so it ON MATCHes this node.
    h.store.set("Character:b1:Elena", {
      bookId: "b1",
      name: "Elena",
      status: "dead",
      deathChapter: 2,
      role: "supporting",
    });
    h.store.set("Event:b1:Death of Elena", {
      bookId: "b1",
      name: "Death of Elena",
      chapter: 2, // narrating chapter present; occursInChapter deliberately ABSENT
      significance: "major",
    });
    h.edges.push({
      fromName: "Elena",
      type: "PARTICIPATES_IN",
      toName: "Death of Elena",
      props: {},
    });

    // First post-fix re-scan re-emits Elena dead at ch5 → the anchor fires with
    // $chapter=5 and ON MATCHes the legacy Event.
    await upsertEntities(
      extraction({ chapterNumber: 5, entities: [character("Elena", "dead")] })
    );

    // (b) the matched Event keeps its OWN story-time (2), not this scan's 5.
    expect(deathEvent("b1", "Elena")!.occursInChapter).toBe(2);

    // (a) the REAL reappearance predicate does NOT fire (5 > 2 would have; 2 > 2
    // does not). Frozen-permanently FP is prevented.
    const issues = await runConsistencyChecks("b1");
    const elenaReappears = issues.filter(
      (i) => i.type === "dead_character_reappears" && i.entities.includes("Elena")
    );
    expect(elenaReappears).toEqual([]);
    // and the death scalar is untouched (still 2 — additive, D-79 intact)
    expect((h.store.get("Character:b1:Elena") as NodeProps).deathChapter).toBe(2);
  });

  it("(d6) death-anchor values ride as Cypher params; labels/edge type are literals (injection boundary intact)", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [character('Zed"}) DETACH DELETE n //', "dead")],
      })
    );
    const deathMerge = h.calls.find((c) =>
      c.query.includes("MERGE (d:Event {bookId: $bookId, name: $deathEventName})")
    );
    expect(deathMerge).toBeDefined();
    expect(deathMerge!.query).not.toContain("DETACH DELETE");
    expect(deathMerge!.params.characterName).toBe('Zed"}) DETACH DELETE n //');
    expect(deathMerge!.params.deathEventName).toBe('Death of Zed"}) DETACH DELETE n //');
  });
});
