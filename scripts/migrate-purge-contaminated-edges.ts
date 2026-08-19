/**
 * RC-6 / D-63 data remediation: purge and repair contaminated Neo4j graph edges
 * that predate the tenant-isolation + relationship-type-sanitizer fixes.
 *
 * Complements scripts/repair-cross-book-edges.ts (which removes SAME-book edges
 * whose r.chapter is out of the book's real chapter range — a different symptom
 * of the D-30 name-only MERGE). This script targets three orthogonal structural
 * contamination classes the repair script does NOT act on (it only *reports*
 * cross-book-endpoint edges as anomalies and never touches userId or type case):
 *
 *   (a) MISSING userId — legacy edges written before RC-6 stamped the owning
 *       tenant onto each edge. Remediation: BACKFILL r.userId from the owning
 *       book's userId (bookId → Book.userId in Postgres), never delete. Only
 *       edges whose owner is not derivable are reported for manual review.
 *
 *   (b) CROSS-BOOK ENDPOINTS — an edge whose two endpoints carry DIFFERENT
 *       bookIds. Post-fix upsertRelationship() binds BOTH endpoints to the same
 *       $bookId, so no such edge can be created any more; every one is pre-fix
 *       cross-book leakage from the name-only MATCH. Remediation: DELETE — but
 *       CONSERVATIVELY. A real cross-book relationship inside a SERIES is
 *       legitimate (ambient series awareness), so an edge whose two books share
 *       the same non-null seriesId (and owner) is EXEMPT and only listed for
 *       review. Edges whose books cannot both be resolved in Postgres are
 *       ANOMALIES (kept, manual review). See classifyCrossBookEdge for the rule.
 *
 *   (c) CASE-VARIANT DUPLICATE relationship types — before
 *       sanitizeRelationshipType() canonicalized every type to its UPPERCASE
 *       union form, the LLM could store e.g. `:allied_with` while a later write
 *       stored `:ALLIED_WITH` between the SAME node pair. Neo4j types are
 *       case-sensitive, so these are two parallel edges the continuity checks
 *       see as one-or-the-other. Remediation: MERGE — fold the variants'
 *       properties onto a single canonical UPPERCASE edge and delete the
 *       variants. A real relationship is never lost.
 *
 * ── Safety model ────────────────────────────────────────────────────────────
 *  - DRY-RUN IS THE DEFAULT. With no flag (or with --dry-run) nothing is
 *    written; the script censuses all three classes, writes a full report to
 *    cowork/bulletproof-qa-2026-07-17/evidence/edge-purge-census.md, and exits
 *    NON-ZERO if any contamination is found (so CI / the team-lead notices).
 *  - --execute performs the remediation, applied in the safe order
 *    (c) merge → (b) delete → (a) backfill, skipping any edge already removed by
 *    an earlier step. Idempotent + safe to re-run.
 *  - The classification/merge logic is pure (no I/O) and unit-tested; the I/O
 *    runner below only reads/writes the graph and Postgres.
 *
 * Run (dry-run):  npx tsx --env-file=.env scripts/migrate-purge-contaminated-edges.ts
 * Run (apply):    npx tsx --env-file=.env scripts/migrate-purge-contaminated-edges.ts --execute
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ─── Pure classification / merge (unit-tested; no I/O) ──────────────────────

/** Postgres book metadata used by the cross-book (b) and backfill (a) rules. */
export interface BookMeta {
  userId: string;
  seriesId: string | null;
}

// ── Class (a): missing userId ───────────────────────────────────────────────

/** A same- or cross-book edge that carries no r.userId (legacy, pre-RC-6). */
export interface MissingUserIdEdge {
  edgeId: string;
  type: string;
  aBookId: string;
  bBookId: string;
  fromName: string;
  toName: string;
}

export type BackfillDecision =
  | { kind: "backfill"; userId: string; reason: string }
  | { kind: "unbackfillable"; reason: string };

/**
 * Decide how to repair one edge missing r.userId. The owner is derivable when a
 * SINGLE user owns both endpoints:
 *   - same-book edge → the book's owner (the overwhelmingly common legacy case);
 *   - cross-book edge whose two books share one owner → that owner.
 * Un-backfillable (report only, never guess) when a book is absent from Postgres
 * or the two endpoints are owned by DIFFERENT users (ambiguous ownership — such
 * an edge is cross-tenant leakage that class (b) will delete anyway).
 */
export function decideUserIdBackfill(
  edge: Pick<MissingUserIdEdge, "aBookId" | "bBookId">,
  bookMeta: ReadonlyMap<string, BookMeta>
): BackfillDecision {
  const a = bookMeta.get(edge.aBookId);
  const b = bookMeta.get(edge.bBookId);

  if (edge.aBookId === edge.bBookId) {
    if (a) {
      return {
        kind: "backfill",
        userId: a.userId,
        reason: `owner of book ${edge.aBookId}`,
      };
    }
    return {
      kind: "unbackfillable",
      reason: `book ${edge.aBookId} not found in Postgres (deleted book / orphaned graph)`,
    };
  }

  // Cross-book edge (also class (b)). Backfill only when one user owns both.
  if (a && b) {
    if (a.userId === b.userId) {
      return {
        kind: "backfill",
        userId: a.userId,
        reason: `single owner of cross-book endpoints ${edge.aBookId} & ${edge.bBookId}`,
      };
    }
    return {
      kind: "unbackfillable",
      reason: `cross-book endpoints owned by different users (${a.userId} vs ${b.userId}) — ambiguous owner (class (b) will remove this edge)`,
    };
  }
  return {
    kind: "unbackfillable",
    reason: `cross-book edge with book(s) missing from Postgres (${edge.aBookId}${a ? "" : "?"} / ${edge.bBookId}${b ? "" : "?"})`,
  };
}

// ── Class (b): cross-book endpoint edges ────────────────────────────────────

export interface CrossBookEdge {
  edgeId: string;
  type: string;
  aBookId: string;
  bBookId: string;
  fromName: string;
  toName: string;
  fromLabels: string[];
  toLabels: string[];
  chapter: number | null;
  updatedAt: string | null;
}

export type CrossBookVerdict =
  /** Endpoints owned by different users — a cross-tenant leak. Delete. */
  | "delete_cross_user"
  /** Same owner, but the two books are NOT the same series. Delete. */
  | "delete_same_user_non_series"
  /** Same owner AND same non-null series — legitimate. Keep, manual review. */
  | "series_exempt"
  /** A book is absent from Postgres — cannot verify. Keep, manual review. */
  | "anomaly";

export interface ClassifiedCrossBookEdge extends CrossBookEdge {
  verdict: CrossBookVerdict;
  reason: string;
}

/**
 * Classify one cross-book-endpoint edge. Conservative: only auto-deletes when
 * both books resolve in Postgres AND they are provably NOT the same series.
 * The series exemption (same owner + same non-null seriesId) is the ONE case
 * where a cross-book edge can be legitimate, so it is never auto-deleted.
 */
export function classifyCrossBookEdge(
  edge: Pick<CrossBookEdge, "aBookId" | "bBookId">,
  bookMeta: ReadonlyMap<string, BookMeta>
): { verdict: CrossBookVerdict; reason: string } {
  const a = bookMeta.get(edge.aBookId);
  const b = bookMeta.get(edge.bBookId);

  if (!a || !b) {
    return {
      verdict: "anomaly",
      reason: `book(s) missing from Postgres (${edge.aBookId}${a ? "" : " [absent]"} / ${edge.bBookId}${b ? "" : " [absent]"}) — cannot verify series/tenant, manual review`,
    };
  }
  if (a.userId !== b.userId) {
    return {
      verdict: "delete_cross_user",
      reason: `endpoints owned by different users (${a.userId} vs ${b.userId}) — cross-tenant leak from the pre-fix name-only MERGE`,
    };
  }
  if (a.seriesId !== null && b.seriesId !== null && a.seriesId === b.seriesId) {
    return {
      verdict: "series_exempt",
      reason: `same owner, same series ${a.seriesId} — legitimate cross-book series relationship, kept for manual review`,
    };
  }
  return {
    verdict: "delete_same_user_non_series",
    reason: `same owner ${a.userId} but not the same series (seriesId ${edge.aBookId}=${a.seriesId ?? "null"} / ${edge.bBookId}=${b.seriesId ?? "null"}) — cross-book contamination`,
  };
}

/** True when a cross-book verdict schedules the edge for deletion. */
export function isCrossBookDeletion(verdict: CrossBookVerdict): boolean {
  return verdict === "delete_cross_user" || verdict === "delete_same_user_non_series";
}

// ── Class (c): case-variant duplicate relationship types ────────────────────

export interface VariantEdge {
  edgeId: string;
  /** Neo4j id(startNode), stringified — pairs the endpoints. */
  aId: string;
  /** Neo4j id(endNode), stringified. */
  bId: string;
  /** Stored relationship type as returned by type(r), e.g. "allied_with". */
  type: string;
  /** All edge properties (properties(r)). */
  props: Record<string, unknown>;
  /** r.updatedAt ISO string, or null — drives latest-wins property folding. */
  updatedAt: string | null;
  /** For reporting only. */
  bookId: string;
  fromName: string;
  toName: string;
}

export interface MergePlan {
  aId: string;
  bId: string;
  /** Canonical UPPERCASE type all variants collapse into. */
  canonicalType: string;
  /**
   * Edge to keep and fold onto (an existing canonical-typed edge). Null when no
   * canonical edge exists yet and one must be CREATED between (aId, bId).
   */
  keeperEdgeId: string | null;
  /** Variant edges to delete after the keeper carries the folded properties. */
  deleteEdgeIds: string[];
  /** Folded properties (latest r.updatedAt wins per key; createdAt dropped). */
  mergedProps: Record<string, unknown>;
  /** Distinct stored types in the group, for the report. */
  memberTypes: string[];
  bookId: string;
  fromName: string;
  toName: string;
}

/** ISO strings sort chronologically; null is treated as the earliest. */
function updatedAtKey(updatedAt: string | null): string {
  return updatedAt ?? "";
}

/**
 * Plan the case-variant merges. A merge group is a directed node pair (aId,bId)
 * plus a canonical type shared by >= 2 stored-type variants. Within each group:
 *   - fold every member's properties, later r.updatedAt winning per key
 *     (createdAt is dropped — it is temporal + write-managed, re-stamped on
 *     create and left untouched on the keeper);
 *   - keep the latest canonical-typed member if one exists, else CREATE a fresh
 *     canonical edge (keeperEdgeId = null) carrying the folded properties;
 *   - delete every other member.
 * Pure: `canonical` is injected (the real sanitizeRelationshipType in prod).
 */
export function planCaseVariantMerges(
  edges: readonly VariantEdge[],
  canonical: (type: string) => string
): MergePlan[] {
  // Group by directed pair + canonical type.
  const groups = new Map<string, VariantEdge[]>();
  for (const e of edges) {
    const key = `${e.aId}|${e.bId}|${canonical(e.type)}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const plans: MergePlan[] = [];
  for (const members of groups.values()) {
    const distinctStoredTypes = [...new Set(members.map((m) => m.type))];
    // A genuine case-variant duplicate needs >= 2 edges whose stored types are
    // NOT already the single identical canonical string. (>= 2 edges between one
    // directed pair collapsing to one canonical always implies differing stored
    // types, since MERGE dedups identical (pair, type); the length guard is
    // belt-and-suspenders.)
    if (members.length < 2) continue;

    const canonicalType = canonical(members[0].type);
    // H2 (determinism): a strict 3-way comparator. When two members share an
    // updatedAt (or both are null → equal empty keys), tiebreak on edgeId so the
    // property-fold winner and the keeper selection never depend on the engine's
    // sort order. Without the tiebreak, `a < b ? -1 : 1` returns 1 for equal
    // keys and equal members get an undefined relative order.
    const sorted = [...members].sort((x, y) => {
      const kx = updatedAtKey(x.updatedAt);
      const ky = updatedAtKey(y.updatedAt);
      if (kx < ky) return -1;
      if (kx > ky) return 1;
      return x.edgeId < y.edgeId ? -1 : x.edgeId > y.edgeId ? 1 : 0;
    });

    // Fold properties, latest updatedAt applied last (wins per key).
    const mergedProps: Record<string, unknown> = {};
    for (const m of sorted) {
      for (const [k, v] of Object.entries(m.props)) {
        mergedProps[k] = v;
      }
    }
    delete mergedProps.createdAt; // temporal, write-managed — never fold.

    // Prefer an existing canonical-typed member (latest updatedAt) as keeper.
    const canonicalMembers = sorted.filter((m) => m.type === canonicalType);
    const keeper =
      canonicalMembers.length > 0
        ? canonicalMembers[canonicalMembers.length - 1]
        : null;

    // H2 (determinism): derive the delete list from `sorted`, not the original
    // input order, so the whole plan is reproducible regardless of how the graph
    // read returned the members.
    const deleteEdgeIds = sorted
      .filter((m) => m.edgeId !== keeper?.edgeId)
      .map((m) => m.edgeId);

    const rep = sorted[sorted.length - 1];
    plans.push({
      aId: rep.aId,
      bId: rep.bId,
      canonicalType,
      keeperEdgeId: keeper?.edgeId ?? null,
      deleteEdgeIds,
      mergedProps,
      memberTypes: [...distinctStoredTypes].sort(),
      bookId: rep.bookId,
      fromName: rep.fromName,
      toName: rep.toName,
    });
  }
  return plans;
}

/**
 * H1 (single-pass convergence): the userId to stamp on a merge's canonical edge.
 * When a merge CREATEs a fresh canonical edge (keeperEdgeId === null) it did not
 * exist when the class-(a) backfill list was scanned, so that list can never
 * stamp it — leaving one un-tenanted edge that a naive run would only fix on a
 * SECOND --execute pass. Stamping it at creation time closes the gap in one pass.
 *
 * Resolution order (conservative, never guesses):
 *   1. a userId already folded from a variant's properties wins (never overwrite);
 *   2. otherwise the owner of the group's book (all members share one bookId,
 *      since the class-(c) read only pairs same-book endpoints);
 *   3. otherwise null — book unresolved, leave un-stamped for manual review
 *      rather than invent an owner.
 */
export function resolveMergedEdgeUserId(
  plan: Pick<MergePlan, "bookId" | "mergedProps">,
  bookMeta: ReadonlyMap<string, BookMeta>
): string | null {
  const folded = plan.mergedProps.userId;
  if (typeof folded === "string" && folded.length > 0) return folded;
  return bookMeta.get(plan.bookId)?.userId ?? null;
}

// ─── I/O runner ─────────────────────────────────────────────────────────────

const TAG = "[migrate-purge-contaminated-edges]";
const CENSUS_PATH = join(
  "cowork",
  "bulletproof-qa-2026-07-17",
  "evidence",
  "edge-purge-census.md"
);
const SAMPLE_LIMIT = 20;

/** A canonical relationship type is always a bare [A-Za-z0-9_] identifier. */
function assertSafeType(type: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(type)) {
    throw new Error(`${TAG} refusing to interpolate unsafe relationship type: ${JSON.stringify(type)}`);
  }
  return type;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

interface Report {
  lines: string[];
}

function line(report: Report, s = ""): void {
  report.lines.push(s);
  console.log(s);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const report: Report = { lines: [] };

  line(report, `# Contaminated-edge purge census`);
  line(report, "");
  line(report, `- Generated: ${new Date().toISOString()}`);
  line(report, `- Mode: ${execute ? "EXECUTE (writes applied)" : "DRY-RUN (default — nothing written)"}`);
  line(report, `- NEO4J_URI: ${process.env.NEO4J_URI ?? "bolt://localhost:7687 (default)"}`);
  line(report, "");
  console.log(
    `${TAG} mode: ${execute ? "EXECUTE" : "DRY-RUN (pass --execute to apply)"}`
  );

  const { withSession, verifyNeo4jConnection, closeNeo4j } = await import(
    "../src/lib/graph/neo4j-client"
  );
  const { sanitizeRelationshipType } = await import("../src/lib/graph/graph-builder");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = (await import("pg")).default;

  if (!process.env.DATABASE_URL) {
    throw new Error(`${TAG} DATABASE_URL not set — infra required`);
  }
  // Fail honestly and early if Neo4j is unreachable.
  if (!(await verifyNeo4jConnection())) {
    throw new Error(
      `${TAG} cannot reach Neo4j at ${process.env.NEO4J_URI ?? "bolt://localhost:7687"} — infra required (start wmb-pub-neo4j-1)`
    );
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // 1. Book metadata (owner + series) — the source of truth for (a) and (b).
    const bookRows = await db.book.findMany({
      select: { id: true, userId: true, seriesId: true },
    });
    const bookMeta = new Map<string, BookMeta>(
      bookRows.map((r) => [r.id, { userId: r.userId, seriesId: r.seriesId }])
    );
    line(report, `Loaded metadata for ${bookMeta.size} book(s) from Postgres.`);
    line(report, "");

    // 2. Read all three contamination classes from Neo4j (read-only).
    const scan = await withSession("READ", async (session) => {
      // Class (a): edges with no r.userId.
      const missingUserId = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE a.bookId IS NOT NULL AND b.bookId IS NOT NULL AND r.userId IS NULL
         RETURN id(r) AS edgeId, type(r) AS relType,
                a.bookId AS aBook, b.bookId AS bBook,
                a.name AS fromName, b.name AS toName`
      );
      // Class (b): cross-book-endpoint edges.
      const crossBook = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE a.bookId IS NOT NULL AND b.bookId IS NOT NULL
           AND a.bookId <> b.bookId
         RETURN id(r) AS edgeId, type(r) AS relType,
                a.bookId AS aBook, b.bookId AS bBook,
                a.name AS fromName, b.name AS toName,
                labels(a) AS fromLabels, labels(b) AS toLabels,
                r.chapter AS chapter, r.updatedAt AS updatedAt`
      );
      // Class (c): every same-book edge with its node-pair, type, and props.
      // (Case variants only ever exist between endpoints of one book — the
      // MERGE that created them was book-scoped; cross-book variants would be
      // handled by class (b) anyway.)
      const allEdges = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE a.bookId IS NOT NULL AND b.bookId IS NOT NULL
           AND a.bookId = b.bookId
         RETURN id(r) AS edgeId, id(a) AS aId, id(b) AS bId,
                type(r) AS relType, a.bookId AS bookId,
                a.name AS fromName, b.name AS toName,
                properties(r) AS props, r.updatedAt AS updatedAt`
      );
      // H3 (blind-spot count): edges with a NULL-bookId endpoint fall outside
      // every scan above (all three require both endpoints bookId IS NOT NULL),
      // so they are never counted. Surface them informationally — no behavior
      // change, but a non-zero count means edges this script does not touch.
      const nullBookEndpoint = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE a.bookId IS NULL OR b.bookId IS NULL
         RETURN count(r) AS c`
      );
      return { missingUserId, crossBook, allEdges, nullBookEndpoint };
    });
    const nullBookEndpointCount =
      toNum(scan.nullBookEndpoint.records[0]?.get("c")) ?? 0;

    // ── Class (a) classification ────────────────────────────────────────────
    const missingEdges: MissingUserIdEdge[] = scan.missingUserId.records.map(
      (rec) => ({
        edgeId: String(toNum(rec.get("edgeId"))),
        type: String(rec.get("relType")),
        aBookId: String(rec.get("aBook")),
        bBookId: String(rec.get("bBook")),
        fromName: String(rec.get("fromName")),
        toName: String(rec.get("toName")),
      })
    );
    const backfillable: Array<{ edge: MissingUserIdEdge; userId: string; reason: string }> = [];
    const unbackfillable: Array<{ edge: MissingUserIdEdge; reason: string }> = [];
    for (const edge of missingEdges) {
      const decision = decideUserIdBackfill(edge, bookMeta);
      if (decision.kind === "backfill") {
        backfillable.push({ edge, userId: decision.userId, reason: decision.reason });
      } else {
        unbackfillable.push({ edge, reason: decision.reason });
      }
    }

    // ── Class (b) classification ────────────────────────────────────────────
    const crossEdges: CrossBookEdge[] = scan.crossBook.records.map((rec) => ({
      edgeId: String(toNum(rec.get("edgeId"))),
      type: String(rec.get("relType")),
      aBookId: String(rec.get("aBook")),
      bBookId: String(rec.get("bBook")),
      fromName: String(rec.get("fromName")),
      toName: String(rec.get("toName")),
      fromLabels: (rec.get("fromLabels") as string[]) ?? [],
      toLabels: (rec.get("toLabels") as string[]) ?? [],
      chapter: toNum(rec.get("chapter")),
      updatedAt: rec.get("updatedAt") == null ? null : String(rec.get("updatedAt")),
    }));
    const classifiedCross: ClassifiedCrossBookEdge[] = crossEdges.map((edge) => {
      const { verdict, reason } = classifyCrossBookEdge(edge, bookMeta);
      return { ...edge, verdict, reason };
    });
    const crossDeletes = classifiedCross.filter((e) => isCrossBookDeletion(e.verdict));
    const crossExempt = classifiedCross.filter((e) => e.verdict === "series_exempt");
    const crossAnomalies = classifiedCross.filter((e) => e.verdict === "anomaly");

    // ── Class (c) classification ────────────────────────────────────────────
    const variantEdges: VariantEdge[] = scan.allEdges.records.map((rec) => ({
      edgeId: String(toNum(rec.get("edgeId"))),
      aId: String(toNum(rec.get("aId"))),
      bId: String(toNum(rec.get("bId"))),
      type: String(rec.get("relType")),
      props: (rec.get("props") as Record<string, unknown>) ?? {},
      updatedAt: rec.get("updatedAt") == null ? null : String(rec.get("updatedAt")),
      bookId: String(rec.get("bookId")),
      fromName: String(rec.get("fromName")),
      toName: String(rec.get("toName")),
    }));
    const mergePlans = planCaseVariantMerges(variantEdges, sanitizeRelationshipType);

    // Informational: node userId coverage (this script remediates EDGES; the
    // RC-6 read guard in graph-queries.ts keys off NODE userId, so a node
    // backfill is a recommended follow-up, not performed here).
    const nodeCoverage = await withSession("READ", async (session) => {
      const res = await session.run(
        `MATCH (n) WHERE n.bookId IS NOT NULL
         RETURN count(n) AS total, count(CASE WHEN n.userId IS NULL THEN 1 END) AS missing`
      );
      const rec = res.records[0];
      return {
        total: toNum(rec?.get("total")) ?? 0,
        missing: toNum(rec?.get("missing")) ?? 0,
      };
    });

    // 3. Report each class.
    const describeCross = (e: ClassifiedCrossBookEdge): string =>
      `(${e.fromLabels.join("|")}) ${e.fromName} [book ${e.aBookId}] -[${e.type} chapter=${e.chapter} updatedAt=${e.updatedAt}]-> (${e.toLabels.join("|")}) ${e.toName} [book ${e.bBookId}] [edge id ${e.edgeId}]`;

    line(report, `## Class (a) — edges missing r.userId (legacy, pre-RC-6)`);
    line(report, "");
    line(report, `- Backfillable: **${backfillable.length}**`);
    line(report, `- Un-backfillable (manual review): **${unbackfillable.length}**`);
    line(report, "");
    if (backfillable.length > 0) {
      line(report, `Sample of up to ${SAMPLE_LIMIT} backfills ${execute ? "APPLIED" : "that WOULD be applied"}:`);
      line(report, "");
      for (const b of backfillable.slice(0, SAMPLE_LIMIT)) {
        line(
          report,
          `- ${execute ? "SET" : "WOULD SET"} r.userId=${b.userId} on ${b.edge.fromName} -[${b.edge.type}]-> ${b.edge.toName} (book ${b.edge.aBookId}, edge id ${b.edge.edgeId}) — ${b.reason}`
        );
      }
      line(report, "");
    }
    for (const u of unbackfillable) {
      line(
        report,
        `- UN-BACKFILLABLE (NOT written) ${u.edge.fromName} -[${u.edge.type}]-> ${u.edge.toName} (books ${u.edge.aBookId}/${u.edge.bBookId}, edge id ${u.edge.edgeId}) — ${u.reason}`
      );
    }
    line(report, "");

    line(report, `## Class (b) — cross-book-endpoint edges`);
    line(report, "");
    line(report, `- Delete (cross-user leak): **${classifiedCross.filter((e) => e.verdict === "delete_cross_user").length}**`);
    line(report, `- Delete (same user, non-series): **${classifiedCross.filter((e) => e.verdict === "delete_same_user_non_series").length}**`);
    line(report, `- Series-exempt (kept, manual review): **${crossExempt.length}**`);
    line(report, `- Anomaly (book unresolved, kept, manual review): **${crossAnomalies.length}**`);
    line(report, "");
    for (const e of crossDeletes) {
      line(report, `- ${execute ? "DELETE" : "WOULD DELETE"} ${describeCross(e)}`);
      line(report, `  - reason: ${e.reason}`);
    }
    for (const e of crossExempt) {
      line(report, `- SERIES-EXEMPT (NOT deleted) ${describeCross(e)}`);
      line(report, `  - reason: ${e.reason}`);
    }
    for (const e of crossAnomalies) {
      line(report, `- ANOMALY (NOT deleted) ${describeCross(e)}`);
      line(report, `  - reason: ${e.reason}`);
    }
    line(report, "");

    line(report, `## Class (c) — case-variant duplicate relationship types`);
    line(report, "");
    line(report, `- Merge groups: **${mergePlans.length}**`);
    line(report, "");
    for (const p of mergePlans.slice(0, SAMPLE_LIMIT)) {
      line(
        report,
        `- ${execute ? "MERGE" : "WOULD MERGE"} ${p.fromName} -[${p.memberTypes.join(" / ")}]-> ${p.toName} (book ${p.bookId}) → canonical :${p.canonicalType}`
      );
      line(
        report,
        `  - ${p.keeperEdgeId ? `keep edge id ${p.keeperEdgeId} (already :${p.canonicalType})` : `CREATE canonical :${p.canonicalType}`}, delete edge id(s) ${p.deleteEdgeIds.join(", ")}`
      );
    }
    line(report, "");

    line(report, `## Informational — node userId coverage (NOT remediated here)`);
    line(report, "");
    line(
      report,
      `- ${nodeCoverage.missing} of ${nodeCoverage.total} book-scoped nodes carry no userId. This script is EDGE-scoped; the RC-6 read guard (graph-queries.userGuard) keys off NODE userId, so a node backfill (same bookId → Book.userId join) is a recommended follow-up dispatch.`
    );
    line(report, "");
    // H3 (blind-spot count): edges with a NULL-bookId endpoint are outside every
    // scan (all three require both endpoints bookId IS NOT NULL). Report the
    // count so a non-zero value is visible — this script does not act on them.
    line(
      report,
      `- ${nullBookEndpointCount} edge(s) have a NULL-bookId endpoint — outside all three scans above (not counted in any class, not remediated here). A non-zero value warrants a separate look.`
    );
    line(report, "");

    // 4. Apply (execute only), in the safe order c → b → a.
    let mergedGroups = 0;
    let deletedCross = 0;
    let backfilledEdges = 0;
    const removedEdgeIds = new Set<string>();

    if (execute) {
      // (c) merges.
      await withSession("WRITE", async (session) => {
        for (const plan of mergePlans) {
          const safeType = assertSafeType(plan.canonicalType);
          if (plan.keeperEdgeId) {
            await session.run(
              `MATCH ()-[r]->() WHERE id(r) = $keeper SET r += $props`,
              { keeper: Number(plan.keeperEdgeId), props: plan.mergedProps }
            );
          } else {
            // H1 (single-pass): a freshly CREATEd canonical edge is invisible to
            // the class-(a) backfill pre-scan, so stamp its userId here (from a
            // folded variant prop, else the book owner) — never a 2nd pass.
            const canonicalUserId = resolveMergedEdgeUserId(plan, bookMeta);
            const createProps =
              canonicalUserId !== null
                ? { ...plan.mergedProps, userId: canonicalUserId }
                : plan.mergedProps;
            await session.run(
              `MATCH (a) WHERE id(a) = $aId
               MATCH (b) WHERE id(b) = $bId
               MERGE (a)-[r:${safeType}]->(b)
               ON CREATE SET r += $props, r.createdAt = datetime()
               ON MATCH SET r += $props`,
              { aId: Number(plan.aId), bId: Number(plan.bId), props: createProps }
            );
          }
          if (plan.deleteEdgeIds.length > 0) {
            const ids = plan.deleteEdgeIds.map((id) => Number(id));
            await session.run(
              `UNWIND $ids AS eid MATCH ()-[r]->() WHERE id(r) = eid DELETE r`,
              { ids }
            );
            for (const id of plan.deleteEdgeIds) removedEdgeIds.add(id);
          }
          mergedGroups += 1;
        }
      });

      // (b) deletes — skip any edge a (c) merge already removed.
      const crossIds = crossDeletes
        .map((e) => e.edgeId)
        .filter((id) => !removedEdgeIds.has(id));
      if (crossIds.length > 0) {
        await withSession("WRITE", async (session) => {
          const result = await session.run(
            `UNWIND $ids AS eid MATCH ()-[r]->() WHERE id(r) = eid DELETE r`,
            { ids: crossIds.map((id) => Number(id)) }
          );
          deletedCross = toNum(result.summary.counters.updates().relationshipsDeleted) ?? 0;
        });
        for (const id of crossIds) removedEdgeIds.add(id);
      }

      // (a) backfill — skip any edge removed by (b) or (c).
      const backfillRows = backfillable
        .filter((b) => !removedEdgeIds.has(b.edge.edgeId))
        .map((b) => ({ edgeId: Number(b.edge.edgeId), userId: b.userId }));
      if (backfillRows.length > 0) {
        await withSession("WRITE", async (session) => {
          const result = await session.run(
            `UNWIND $rows AS row
             MATCH ()-[r]->() WHERE id(r) = row.edgeId
             SET r.userId = row.userId`,
            { rows: backfillRows }
          );
          backfilledEdges = toNum(result.summary.counters.updates().propertiesSet) ?? 0;
        });
      }
    }

    // 5. Summary + exit code.
    const contaminationCount =
      backfillable.length +
      unbackfillable.length +
      crossDeletes.length +
      crossExempt.length +
      crossAnomalies.length +
      mergePlans.length;
    const reviewCount = unbackfillable.length + crossExempt.length + crossAnomalies.length;

    line(report, `## Summary`);
    line(report, "");
    line(
      report,
      `${execute ? "EXECUTE" : "DRY-RUN"}: ` +
        `(a) ${backfillable.length} userId backfill(s) ${execute ? `applied (${backfilledEdges} prop(s) set)` : "planned"}, ${unbackfillable.length} un-backfillable; ` +
        `(b) ${crossDeletes.length} cross-book edge(s) ${execute ? `deleted (${deletedCross} confirmed)` : "would be deleted"}, ${crossExempt.length} series-exempt, ${crossAnomalies.length} anomaly; ` +
        `(c) ${mergePlans.length} case-variant merge group(s) ${execute ? `merged (${mergedGroups} applied)` : "planned"}.`
    );
    if (!execute && contaminationCount > 0) {
      line(report, "");
      line(report, `Nothing was written. Re-run with --execute to apply.`);
    }
    line(report, "");

    // Persist the census report.
    mkdirSync(dirname(CENSUS_PATH), { recursive: true });
    writeFileSync(CENSUS_PATH, report.lines.join("\n"), "utf8");
    console.log(`${TAG} census written to ${CENSUS_PATH}`);

    // Exit non-zero: dry-run if ANY contamination found; execute if anything
    // still needs manual review.
    if (!execute && contaminationCount > 0) {
      console.log(`${TAG} exit 1: ${contaminationCount} contaminated/repairable item(s) found (dry-run)`);
      process.exitCode = 1;
    } else if (execute && reviewCount > 0) {
      console.log(`${TAG} exit 1: ${reviewCount} item(s) still need manual review after execute`);
      process.exitCode = 1;
    } else {
      console.log(`${TAG} exit 0: no contamination`);
    }
  } finally {
    await db.$disconnect();
    await pool.end();
    await closeNeo4j();
  }
}

// Only run when invoked directly; tests import the pure classifiers above
// without touching any database.
const isDirectRun = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("migrate-purge-contaminated-edges.ts");
if (isDirectRun) {
  main().catch((error) => {
    console.error(`${TAG} failed:`, error);
    process.exitCode = 1;
  });
}
