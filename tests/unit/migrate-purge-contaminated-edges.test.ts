import { describe, it, expect } from "vitest";

/**
 * RC-6 / D-63 data remediation: unit tests for the pure classification and
 * merge logic in scripts/migrate-purge-contaminated-edges.ts.
 *
 * Contamination background: pre-fix graph edges were written with bookId-only
 * scoping and no userId stamp (class a), the name-only MERGE could bind
 * endpoints across books (class b), and pre-sanitizer LLM output stored
 * case-variant relationship types like :allied_with alongside :ALLIED_WITH
 * (class c). These tests pin the conservative rules the script applies.
 */
import {
  decideUserIdBackfill,
  classifyCrossBookEdge,
  isCrossBookDeletion,
  planCaseVariantMerges,
  resolveMergedEdgeUserId,
  type BookMeta,
  type VariantEdge,
} from "../../scripts/migrate-purge-contaminated-edges";
// The real Cypher-boundary canonicalizer — class (c) must collapse exactly the
// case variants the production sanitizer collapses.
import { sanitizeRelationshipType } from "../../src/lib/graph/graph-builder";

const USER_A = "user-alpha";
const USER_B = "user-beta";
const SERIES_1 = "series-one";
const BOOK1 = "book-1";
const BOOK2 = "book-2"; // same user + series as BOOK1
const BOOK3 = "book-3"; // same user, no series
const BOOK4 = "book-4"; // different user

const bookMeta = new Map<string, BookMeta>([
  [BOOK1, { userId: USER_A, seriesId: SERIES_1 }],
  [BOOK2, { userId: USER_A, seriesId: SERIES_1 }],
  [BOOK3, { userId: USER_A, seriesId: null }],
  [BOOK4, { userId: USER_B, seriesId: null }],
]);

describe("decideUserIdBackfill — class (a) missing userId", () => {
  it("backfills a same-book edge from the book's owner", () => {
    const d = decideUserIdBackfill({ aBookId: BOOK1, bBookId: BOOK1 }, bookMeta);
    expect(d).toEqual({
      kind: "backfill",
      userId: USER_A,
      reason: expect.stringContaining(BOOK1),
    });
  });

  it("reports a same-book edge whose book is absent from Postgres as un-backfillable", () => {
    const d = decideUserIdBackfill(
      { aBookId: "ghost-book", bBookId: "ghost-book" },
      bookMeta
    );
    expect(d.kind).toBe("unbackfillable");
  });

  it("backfills a cross-book edge when a single user owns both books", () => {
    const d = decideUserIdBackfill({ aBookId: BOOK1, bBookId: BOOK2 }, bookMeta);
    expect(d).toMatchObject({ kind: "backfill", userId: USER_A });
  });

  it("refuses to guess a cross-user cross-book edge's owner", () => {
    const d = decideUserIdBackfill({ aBookId: BOOK1, bBookId: BOOK4 }, bookMeta);
    expect(d.kind).toBe("unbackfillable");
    expect(d.reason).toMatch(/different users/);
  });

  it("reports a cross-book edge with a missing book as un-backfillable", () => {
    const d = decideUserIdBackfill({ aBookId: BOOK1, bBookId: "ghost" }, bookMeta);
    expect(d.kind).toBe("unbackfillable");
  });
});

describe("classifyCrossBookEdge — class (b) cross-book endpoints", () => {
  it("deletes a cross-user (cross-tenant) edge", () => {
    const { verdict } = classifyCrossBookEdge({ aBookId: BOOK1, bBookId: BOOK4 }, bookMeta);
    expect(verdict).toBe("delete_cross_user");
    expect(isCrossBookDeletion(verdict)).toBe(true);
  });

  it("EXEMPTS a same-owner same-series cross-book edge (legitimate series relationship)", () => {
    const { verdict, reason } = classifyCrossBookEdge(
      { aBookId: BOOK1, bBookId: BOOK2 },
      bookMeta
    );
    expect(verdict).toBe("series_exempt");
    expect(isCrossBookDeletion(verdict)).toBe(false);
    expect(reason).toMatch(/series/);
  });

  it("deletes a same-owner but non-series cross-book edge", () => {
    const { verdict } = classifyCrossBookEdge({ aBookId: BOOK1, bBookId: BOOK3 }, bookMeta);
    expect(verdict).toBe("delete_same_user_non_series");
    expect(isCrossBookDeletion(verdict)).toBe(true);
  });

  it("does NOT exempt two books that both have a NULL series", () => {
    const meta = new Map<string, BookMeta>([
      [BOOK3, { userId: USER_A, seriesId: null }],
      ["book-5", { userId: USER_A, seriesId: null }],
    ]);
    const { verdict } = classifyCrossBookEdge({ aBookId: BOOK3, bBookId: "book-5" }, meta);
    expect(verdict).toBe("delete_same_user_non_series");
  });

  it("marks an edge whose book is unresolved in Postgres as an anomaly (never auto-deleted)", () => {
    const { verdict } = classifyCrossBookEdge({ aBookId: BOOK1, bBookId: "ghost" }, bookMeta);
    expect(verdict).toBe("anomaly");
    expect(isCrossBookDeletion(verdict)).toBe(false);
  });
});

describe("planCaseVariantMerges — class (c) case-variant duplicates", () => {
  function variant(over: Partial<VariantEdge>): VariantEdge {
    return {
      edgeId: "e0",
      aId: "1",
      bId: "2",
      type: "ALLIED_WITH",
      props: {},
      updatedAt: null,
      bookId: BOOK1,
      fromName: "Mira",
      toName: "Kestrel",
      ...over,
    };
  }

  it("merges :allied_with into an existing :ALLIED_WITH between the same pair, folding latest-updatedAt props", () => {
    const older = variant({
      edgeId: "eLow",
      type: "allied_with",
      updatedAt: "2026-01-01T00:00:00.000Z",
      props: { chapter: 3, note: "old", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    const canonical = variant({
      edgeId: "eCanon",
      type: "ALLIED_WITH",
      updatedAt: "2026-02-01T00:00:00.000Z",
      props: { chapter: 5, extra: "new", createdAt: "2026-02-01T00:00:00.000Z" },
    });

    const plans = planCaseVariantMerges([older, canonical], sanitizeRelationshipType);
    expect(plans).toHaveLength(1);
    const p = plans[0];
    expect(p.canonicalType).toBe("ALLIED_WITH");
    expect(p.keeperEdgeId).toBe("eCanon");
    expect(p.deleteEdgeIds).toEqual(["eLow"]);
    // latest updatedAt (Feb) wins per key; note from the older survives; the
    // temporal, write-managed createdAt is never folded.
    expect(p.mergedProps).toEqual({ chapter: 5, note: "old", extra: "new" });
    expect(p.memberTypes.sort()).toEqual(["ALLIED_WITH", "allied_with"]);
  });

  it("CREATES a canonical edge when only lowercase variants exist (no keeper)", () => {
    const plans = planCaseVariantMerges(
      [
        variant({ edgeId: "eA", type: "allied_with", updatedAt: "2026-01-01T00:00:00.000Z" }),
        variant({ edgeId: "eB", type: "Allied_With", updatedAt: "2026-01-02T00:00:00.000Z" }),
      ],
      sanitizeRelationshipType
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].keeperEdgeId).toBeNull();
    expect(plans[0].canonicalType).toBe("ALLIED_WITH");
    expect(plans[0].deleteEdgeIds.sort()).toEqual(["eA", "eB"]);
  });

  it("does NOT plan a merge for a lone non-canonical edge (not a duplicate)", () => {
    const plans = planCaseVariantMerges(
      [variant({ edgeId: "eSolo", type: "allied_with" })],
      sanitizeRelationshipType
    );
    expect(plans).toEqual([]);
  });

  it("does not merge across different node pairs or different canonical types", () => {
    const plans = planCaseVariantMerges(
      [
        variant({ edgeId: "e1", aId: "1", bId: "2", type: "allied_with" }),
        variant({ edgeId: "e2", aId: "1", bId: "2", type: "ALLIED_WITH" }),
        // different directed pair
        variant({ edgeId: "e3", aId: "3", bId: "4", type: "allied_with" }),
        // same pair as e1/e2 but different canonical type
        variant({ edgeId: "e4", aId: "1", bId: "2", type: "opposes" }),
      ],
      sanitizeRelationshipType
    );
    // Only the (1,2, ALLIED_WITH) pair has 2 members → one plan.
    expect(plans).toHaveLength(1);
    expect(plans[0].aId).toBe("1");
    expect(plans[0].bId).toBe("2");
    expect(plans[0].canonicalType).toBe("ALLIED_WITH");
  });

  it("treats a reversed-direction edge as a distinct pair (not a duplicate)", () => {
    const plans = planCaseVariantMerges(
      [
        variant({ edgeId: "fwd", aId: "1", bId: "2", type: "ALLIED_WITH" }),
        variant({ edgeId: "rev", aId: "2", bId: "1", type: "allied_with" }),
      ],
      sanitizeRelationshipType
    );
    expect(plans).toEqual([]);
  });

  it("H2: produces an identical plan regardless of input member order (edgeId tiebreak on equal/null updatedAt)", () => {
    // Both members are canonical-typed with a NULL updatedAt, so without a
    // deterministic tiebreak the fold winner + keeper would depend on engine
    // sort order. The edgeId tiebreak pins "e-bbb" (higher edgeId) as latest.
    const a = variant({
      edgeId: "e-aaa",
      type: "ALLIED_WITH",
      updatedAt: null,
      props: { chapter: 1, only_a: "a" },
    });
    const b = variant({
      edgeId: "e-bbb",
      type: "ALLIED_WITH",
      updatedAt: null,
      props: { chapter: 2, only_b: "b" },
    });

    const forward = planCaseVariantMerges([a, b], sanitizeRelationshipType);
    const reversed = planCaseVariantMerges([b, a], sanitizeRelationshipType);

    expect(forward).toEqual(reversed); // whole plan is input-order-independent
    expect(forward).toHaveLength(1);
    expect(forward[0].keeperEdgeId).toBe("e-bbb");
    expect(forward[0].deleteEdgeIds).toEqual(["e-aaa"]);
    expect(forward[0].mergedProps).toEqual({ chapter: 2, only_a: "a", only_b: "b" });
  });
});

describe("resolveMergedEdgeUserId — H1 single-pass canonical stamp", () => {
  it("stamps the book owner on a create-canonical merge with no folded userId", () => {
    expect(
      resolveMergedEdgeUserId({ bookId: BOOK1, mergedProps: { chapter: 5 } }, bookMeta)
    ).toBe(USER_A);
  });

  it("keeps a userId already folded from a variant (never overwrites with the book owner)", () => {
    expect(
      resolveMergedEdgeUserId(
        { bookId: BOOK1, mergedProps: { chapter: 5, userId: "explicit-owner" } },
        bookMeta
      )
    ).toBe("explicit-owner");
  });

  it("returns null when the book is unresolved — never guesses an owner", () => {
    expect(
      resolveMergedEdgeUserId({ bookId: "ghost-book", mergedProps: {} }, bookMeta)
    ).toBeNull();
  });
});
