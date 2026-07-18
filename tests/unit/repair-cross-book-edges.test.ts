import { describe, it, expect } from "vitest";

/**
 * D-30 data repair: unit tests for the pure classification heuristic in
 * scripts/repair-cross-book-edges.ts.
 *
 * Contamination background: pre-fix upsertRelationship() MERGEd one edge per
 * same-named node pair across ALL books in a single call — so every edge
 * written by one contaminating call shares byte-identical (type, r.chapter,
 * r.updatedAt) across books ("timestamp twins"), and a victim book can carry
 * an r.chapter that does not exist among its own chapters (the empirical D-30
 * proof: book1 with chapters 1-5 carrying ALLIED_WITH r.chapter=6).
 */
import {
  classifyEdges,
  flagsTouchedByDeletions,
  type EdgeRecord,
  type FlagLite,
} from "../../scripts/repair-cross-book-edges";

const BOOK1 = "book1-fd60e1d4"; // chapters 1-5 (the D-30 victim shape)
const BOOK2 = "book2-source"; //   chapters 1-9 (the D-30 source shape)

const chapters = new Map<string, ReadonlySet<number>>([
  [BOOK1, new Set([1, 2, 3, 4, 5])],
  [BOOK2, new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])],
]);

let seq = 0;
function edge(over: Partial<EdgeRecord>): EdgeRecord {
  return {
    edgeId: `e${seq++}`,
    type: "ALLIED_WITH",
    bookId: BOOK1,
    fromName: "Sarah",
    toName: "John Miller",
    fromLabels: ["Character"],
    toLabels: ["Character"],
    chapter: 1,
    updatedAt: null,
    ...over,
  };
}

describe("classifyEdges — D-30 contamination heuristic", () => {
  it("flags a chapter-out-of-range edge as contaminated, with twin forensics when a byte-identical edge exists in another book", () => {
    // The exact empirical D-30 shape: book1 (chapters 1-5) carries an
    // ALLIED_WITH chapter=6 edge whose updatedAt is byte-identical to
    // book2's legit chapter-6 edge (both written by ONE contaminating MERGE).
    const t = "2026-07-18T02:54:33.420Z";
    const victim = edge({ bookId: BOOK1, chapter: 6, updatedAt: t });
    const source = edge({ bookId: BOOK2, chapter: 6, updatedAt: t });

    const classified = classifyEdges([victim, source], chapters);
    const v = classified.find((e) => e.edgeId === victim.edgeId)!;
    const s = classified.find((e) => e.edgeId === source.edgeId)!;

    expect(v.verdict).toBe("contaminated");
    expect(v.twinBookIds).toEqual([BOOK2]);
    expect(v.reasons.join(" ")).toMatch(/chapter 6/);

    // The single in-range member of the twin group is the presumed source —
    // kept, not deleted, but annotated.
    expect(s.verdict).toBe("clean");
    expect(s.reasons.join(" ")).toMatch(/presumed source/i);
  });

  it("treats a float r.chapter (driver writes 6.0) as its integer chapter", () => {
    const classified = classifyEdges(
      [edge({ bookId: BOOK1, chapter: 6.0 }), edge({ bookId: BOOK1, chapter: 3.0 })],
      chapters
    );
    expect(classified[0].verdict).toBe("contaminated");
    expect(classified[1].verdict).toBe("clean");
  });

  it("flags chapter-out-of-range even WITHOUT a surviving twin (aged contamination / invalid provenance)", () => {
    // Twins die when the source book re-extracts (ON MATCH bumps updatedAt),
    // so range-fail alone must be sufficient for deletion.
    const classified = classifyEdges(
      [edge({ bookId: BOOK1, chapter: 7, updatedAt: "2026-07-01T00:00:00.000Z" })],
      chapters
    );
    expect(classified[0].verdict).toBe("contaminated");
  });

  it("marks in-range timestamp-twins in MULTIPLE books as ambiguous — never auto-deleted", () => {
    // Both books legitimately contain chapter 3: cannot tell which was the
    // contaminating call's source and which is an in-range victim.
    const t = "2026-07-18T09:04:06.482Z";
    const classified = classifyEdges(
      [
        edge({ bookId: BOOK1, chapter: 3, updatedAt: t, type: "OPPOSES" }),
        edge({ bookId: BOOK2, chapter: 3, updatedAt: t, type: "OPPOSES" }),
      ],
      chapters
    );
    expect(classified.map((e) => e.verdict)).toEqual(["ambiguous", "ambiguous"]);
    expect(classified[0].twinBookIds).toEqual([BOOK2]);
  });

  it("does NOT twin-match edges that differ in type or chapter or timestamp", () => {
    const t = "2026-07-18T09:04:06.482Z";
    const classified = classifyEdges(
      [
        edge({ bookId: BOOK1, chapter: 3, updatedAt: t, type: "OPPOSES" }),
        edge({ bookId: BOOK2, chapter: 3, updatedAt: t, type: "ALLIED_WITH" }),
        edge({ bookId: BOOK2, chapter: 4, updatedAt: t, type: "OPPOSES" }),
        edge({ bookId: BOOK2, chapter: 3, updatedAt: "2026-07-18T09:04:06.483Z", type: "OPPOSES" }),
      ],
      chapters
    );
    expect(classified.map((e) => e.verdict)).toEqual(["clean", "clean", "clean", "clean"]);
    expect(classified[0].twinBookIds).toEqual([]);
  });

  it("chapter 0 (story bible extraction) is always legitimate", () => {
    const classified = classifyEdges([edge({ bookId: BOOK1, chapter: 0 })], chapters);
    expect(classified[0].verdict).toBe("clean");
  });

  it("edge in a book with no Postgres chapters at all → anomaly (orphaned graph), never auto-deleted", () => {
    const classified = classifyEdges(
      [edge({ bookId: "deleted-book", chapter: 2 })],
      chapters
    );
    expect(classified[0].verdict).toBe("anomaly");
  });

  it("edge with no chapter property → anomaly (foreign/manual write), never auto-deleted", () => {
    const classified = classifyEdges([edge({ chapter: null })], chapters);
    expect(classified[0].verdict).toBe("anomaly");
  });
});

describe("flagsTouchedByDeletions — continuity flags needing manual review", () => {
  const deleted = classifyEdges(
    [edge({ bookId: BOOK1, chapter: 6, fromName: "Sarah", toName: "John Miller" })],
    chapters
  ).filter((e) => e.verdict === "contaminated");

  function flag(over: Partial<FlagLite>): FlagLite {
    return {
      id: "52af6dc9",
      bookId: BOOK1,
      type: "relationship_contradiction",
      status: "active",
      entities: JSON.stringify(["Sarah", "John Miller"]),
      description: "Characters marked as both ALLIED_WITH and OPPOSES",
      ...over,
    };
  }

  it("lists a flag whose book and entities intersect a deleted edge's endpoints", () => {
    expect(flagsTouchedByDeletions([flag({})], deleted)).toHaveLength(1);
  });

  it("ignores flags on other books or with disjoint entities", () => {
    expect(
      flagsTouchedByDeletions(
        [
          flag({ bookId: BOOK2 }),
          flag({ entities: JSON.stringify(["Corvin", "Mara"]) }),
        ],
        deleted
      )
    ).toHaveLength(0);
  });

  it("includes intentional (suppressed) flags too — suppression does not follow contamination", () => {
    expect(
      flagsTouchedByDeletions([flag({ status: "intentional" })], deleted)
    ).toHaveLength(1);
  });

  it("skips flags with unparseable entities JSON without throwing", () => {
    expect(flagsTouchedByDeletions([flag({ entities: "not json" })], deleted)).toHaveLength(0);
  });

  it("returns nothing when no edges were deleted", () => {
    expect(flagsTouchedByDeletions([flag({})], [])).toHaveLength(0);
  });
});
