import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * D-19 regression: the series-continuity "moat" runs contradiction checks
 * (runConsistencyChecks in graph-queries.ts). Two of the four are LAND-NOW
 * correct after this fix — relationship_contradiction (already worked) and
 * dead_character_reappears — and both of the latter's graph inputs are written
 * deterministically by the upsert path here:
 *   - Event.chapter powers location_conflict / timeline_violation (both gated /
 *     documented off, but the property is written correctly either way)
 *   - Character.deathChapter powers dead_character_reappears
 *
 * Neither is asked of the extraction LLM; both are stamped from the chapter
 * being scanned (mirroring relationship.chapter). Both are STABLE first-
 * occurrence facts: set on ON CREATE, preserved on ON MATCH via coalesce.
 *
 * The fake Neo4j session below mirrors real MERGE semantics precisely — ON
 * CREATE applies $createProps, ON MATCH applies $updateProps then the coalesce
 * stable-items — so create-vs-match behaviour (posthumous death on create,
 * first-write-wins on match, Event.chapter stability) is exercised for real,
 * not masked by a substring-only emulation.
 */

type Params = Record<string, unknown>;

const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Params }>,
  store: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        h.calls.push({ query, params });
        const merge = query.match(/MERGE \(n:(\w+) \{bookId: \$bookId, name: \$name\}\)/);
        if (merge && query.includes("RETURN n.createdAt = n.updatedAt AS isNew")) {
          const label = merge[1];
          const key = `${label}:${String(params.bookId)}:${String(params.name)}`;
          const existing = h.store.get(key);
          let merged: Record<string, unknown>;
          if (!existing) {
            // ON CREATE SET n += $createProps, ..., n.firstAppearance = $chapter
            merged = { ...(params.createProps as Params), firstAppearance: params.chapter };
          } else {
            // ON MATCH SET n += $updateProps [, <coalesce stable items>]
            merged = { ...existing, ...(params.updateProps as Params) };
            if (query.includes("n.chapter = coalesce(n.chapter, $chapter)")) {
              merged.chapter = existing.chapter ?? params.chapter;
            }
            if (query.includes("n.deathChapter = coalesce(n.deathChapter, $chapter)")) {
              merged.deathChapter = existing.deathChapter ?? params.chapter;
            }
          }
          h.store.set(key, merged);
          return { records: [{ get: (k: string) => (k === "isNew" ? !existing : null) }] };
        }
        // alias-lookup and any other read: no matches
        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import {
  upsertEntities,
  deriveEntityGraphProps,
  isDeadStatus,
} from "@/lib/graph/graph-builder";
import type { ExtractionResult, GraphNodeLabel } from "@/lib/graph/types";

const mergeCalls = () =>
  h.calls.filter((c) => c.query.includes("RETURN n.createdAt = n.updatedAt AS isNew"));
const node = (key: string): Params => h.store.get(key) as Params;

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
});

// ─── Pure deterministic derivation ──────────────────────────────

describe("deriveEntityGraphProps — deterministic continuity property injection", () => {
  it("(a) stamps Event.chapter = the scan's chapterNumber, as an integer", () => {
    const d = deriveEntityGraphProps("Event", { significance: "major" }, 7);
    expect(d.chapter).toBe(7);
    expect(Number.isInteger(d.chapter)).toBe(true);
    expect(typeof d.chapter).toBe("number");
  });

  it("does not stamp chapter on non-Event nodes", () => {
    expect(deriveEntityGraphProps("Character", { status: "alive" }, 7).chapter).toBeUndefined();
    expect(deriveEntityGraphProps("Location", {}, 7).chapter).toBeUndefined();
    expect(deriveEntityGraphProps("Object", {}, 7).chapter).toBeUndefined();
  });

  it("(b) derives deathChapter = N for a Character extracted status=dead in chapter N", () => {
    const d = deriveEntityGraphProps("Character", { status: "dead" }, 12);
    expect(d.deathChapter).toBe(12);
    expect(Number.isInteger(d.deathChapter)).toBe(true);
  });

  it("does not derive deathChapter for a living / unknown character", () => {
    expect(deriveEntityGraphProps("Character", { status: "alive" }, 12).deathChapter).toBeUndefined();
    expect(deriveEntityGraphProps("Character", { status: "unknown" }, 12).deathChapter).toBeUndefined();
    expect(deriveEntityGraphProps("Character", {}, 12).deathChapter).toBeUndefined();
  });

  it("matches the check's exact status vocabulary ('dead'), case/space-insensitively", () => {
    expect(isDeadStatus("dead")).toBe(true);
    expect(isDeadStatus(" Dead ")).toBe(true);
    // The dead_character_reappears Cypher keys off c.status = "dead" exactly, so a
    // synonym like "deceased" would not satisfy the check even if we set deathChapter.
    expect(isDeadStatus("deceased")).toBe(false);
    expect(isDeadStatus("alive")).toBe(false);
    expect(isDeadStatus(undefined)).toBe(false);
    expect(isDeadStatus(3)).toBe(false);
  });

  it("does NOT derive deathChapter from the story bible (chapter 0 = pre-story canonical)", () => {
    // chapter 0 is the story-bible sentinel (see graph-maintenance.updateFromStoryBible);
    // a 'dead' status there is backstory, not an in-story death. Recording
    // deathChapter=0 would spuriously trip the check on any later real event.
    expect(deriveEntityGraphProps("Character", { status: "dead" }, 0).deathChapter).toBeUndefined();
  });
});

// ─── Real upsert path writes the properties the checks read ─────

describe("upsertEntities writes the continuity properties runConsistencyChecks reads (D-19)", () => {
  it("(a) an Event upserted during a chapter-N scan carries chapter=N on ON CREATE; it is NOT in updateProps (stable fact, not merged on match)", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 7,
        entities: [
          {
            name: "First Assault on Ashfall Gate",
            label: "Event",
            properties: { bookId: "b1", significance: "major" },
          },
        ],
      })
    );
    const merge = mergeCalls()[0];
    const createProps = merge.params.createProps as Params;
    const updateProps = merge.params.updateProps as Params;
    expect(createProps.chapter).toBe(7);
    expect(Number.isInteger(createProps.chapter)).toBe(true);
    expect(updateProps.chapter).toBeUndefined(); // stable: never merged on match
    expect(merge.query).toContain("n.chapter = coalesce(n.chapter, $chapter)");
    expect(node("Event:b1:First Assault on Ashfall Gate").chapter).toBe(7);
  });

  it("(#3) Event.chapter is first-occurrence-STABLE: a later re-scan/re-mention does not overwrite it (occurred-in, not last-mentioned)", async () => {
    const battle = {
      name: "The Battle",
      label: "Event" as GraphNodeLabel,
      properties: { bookId: "b1", significance: "climax" },
    };
    await upsertEntities(extraction({ chapterNumber: 5, entities: [{ ...battle }] }));
    await upsertEntities(extraction({ chapterNumber: 9, entities: [{ ...battle }] }));
    expect(node("Event:b1:The Battle").chapter).toBe(5);
  });

  it("(d) two Events in the SAME chapter both carry chapter=N — the location_conflict predicate e1.chapter = e2.chapter is satisfiable", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [
          { name: "Ana at the Docks", label: "Event", properties: { bookId: "b1" } },
          { name: "Ana at the Palace", label: "Event", properties: { bookId: "b1" } },
        ],
      })
    );
    expect(node("Event:b1:Ana at the Docks").chapter).toBe(4);
    expect(node("Event:b1:Ana at the Palace").chapter).toBe(4);
  });

  it("(b / #1) a Character introduced already-dead in chapter N gets deathChapter=N on ON CREATE (posthumous / off-page death)", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 12,
        entities: [
          {
            name: "Corvin",
            label: "Character",
            properties: { bookId: "b1", status: "dead", role: "supporting" },
          },
        ],
      })
    );
    const merge = mergeCalls()[0];
    // set on the CREATE props (the #1 fix), NOT the update/match props
    expect((merge.params.createProps as Params).deathChapter).toBe(12);
    expect((merge.params.updateProps as Params).deathChapter).toBeUndefined();
    expect(merge.query).toContain("n.deathChapter = coalesce(n.deathChapter, $chapter)");
    expect(node("Character:b1:Corvin").deathChapter).toBe(12);
  });

  it("(c) does NOT overwrite an earlier death when the dead character is re-scanned later (first-write-wins on match)", async () => {
    const corvinDead = {
      name: "Corvin",
      label: "Character" as GraphNodeLabel,
      properties: { bookId: "b1", status: "dead", role: "supporting" },
    };
    await upsertEntities(extraction({ chapterNumber: 3, entities: [{ ...corvinDead }] })); // CREATE → 3
    await upsertEntities(extraction({ chapterNumber: 7, entities: [{ ...corvinDead }] })); // MATCH → coalesce(3,7)=3
    expect(node("Character:b1:Corvin").deathChapter).toBe(3);
  });

  it("(c') a living→dead flip detected on a later scan records the chapter it was first detected (coalesce(null,N)=N on match)", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 3,
        entities: [{ name: "Mara", label: "Character", properties: { bookId: "b1", status: "alive" } }],
      })
    ); // CREATE alive → no deathChapter
    await upsertEntities(
      extraction({
        chapterNumber: 7,
        entities: [{ name: "Mara", label: "Character", properties: { bookId: "b1", status: "dead" } }],
      })
    ); // MATCH, now dead → coalesce(null,7)=7
    expect(node("Character:b1:Mara").deathChapter).toBe(7);
  });

  it("does not set deathChapter (nor emit its coalesce clause) for a living character", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 12,
        entities: [{ name: "Vera", label: "Character", properties: { bookId: "b1", status: "alive" } }],
      })
    );
    const merge = mergeCalls()[0];
    expect(merge.query).not.toContain("n.deathChapter = coalesce");
    expect((merge.params.createProps as Params).deathChapter).toBeUndefined();
    expect(node("Character:b1:Vera").deathChapter).toBeUndefined();
  });

  it("strips any LLM-emitted chapter/deathChapter so only the application-derived value is written", async () => {
    // An Event whose LLM output smuggled a wrong chapter, plus a stray deathChapter.
    await upsertEntities(
      extraction({
        chapterNumber: 8,
        entities: [
          {
            name: "Skirmish",
            label: "Event",
            properties: { bookId: "b1", chapter: 999, deathChapter: 999, significance: "minor" },
          },
        ],
      })
    );
    const merge = mergeCalls()[0];
    const createProps = merge.params.createProps as Params;
    const updateProps = merge.params.updateProps as Params;
    expect(createProps.chapter).toBe(8); // application value, not 999
    expect(updateProps.chapter).toBeUndefined();
    expect(updateProps.deathChapter).toBeUndefined(); // stray LLM key stripped
    expect(node("Event:b1:Skirmish").chapter).toBe(8);
  });
});
