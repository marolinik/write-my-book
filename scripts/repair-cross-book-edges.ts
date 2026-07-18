/**
 * D-30 repair: remove cross-book-contaminated relationship edges from Neo4j.
 *
 * Pre-fix, upsertRelationship() MATCHed its endpoints by NAME ONLY (with just
 * a relative `WHERE a.bookId = b.bookId`) and MERGEd the edge onto EVERY
 * same-named node pair in every book — including other users' books. One
 * contaminating call stamped byte-identical (type, r.chapter, r.updatedAt)
 * onto each victim pair, and victim books can carry r.chapter values that do
 * not exist among their own chapters (empirical proof: book fd60e1d4…, with
 * chapters 1-5 only, carrying ALLIED_WITH r.chapter=6 / OPPOSES r.chapter=9
 * byte-identical to the source book's edges).
 *
 * ── Detection heuristic (per same-book edge a-[r]->b, bookId B) ────────────
 *  legit(B) = B's chapter numbers in Postgres ∪ {0}   (0 = story-bible scan)
 *
 *  CONTAMINATED (deleted on --execute):
 *    r.chapter ∉ legit(B). No chapter of B could have produced this edge —
 *    its provenance is invalid whether it came from another book's extraction
 *    or from a chapter since deleted, and the continuity checks that consume
 *    r.chapter can only be misled by it. When a byte-identical
 *    (type, chapter, updatedAt) twin exists in another book, that twin's
 *    bookIds are reported as forensic confirmation of the cross-book write.
 *
 *  CLEAN "presumed source": within a timestamp-twin group (identical type +
 *    chapter + updatedAt across MULTIPLE books — the signature of one
 *    contaminating MERGE), a member whose book is the ONLY in-range one is
 *    presumed to be the legitimate source edge of that write. Kept.
 *
 *  AMBIGUOUS (listed, NEVER auto-deleted): in-range members of a twin group
 *    spanning multiple in-range books — the contamination landed on a chapter
 *    number the victim book also has, so source and victim cannot be told
 *    apart. Manual review.
 *
 *  ANOMALY (listed, NEVER auto-deleted): edge whose book has no chapters in
 *    Postgres (orphaned graph / deleted book), edge without an r.chapter
 *    (upsertRelationship always stamps one — foreign/manual write), or edge
 *    whose endpoints sit in DIFFERENT books (impossible even pre-fix, which
 *    enforced a.bookId = b.bookId).
 *
 * ── Honest error characteristics ───────────────────────────────────────────
 *  FALSE NEGATIVES (contamination this script cannot see):
 *   - In-range contamination: a contaminating write whose chapter number the
 *     victim book ALSO has is invisible to the range test; it is surfaced
 *     only while its timestamp twin survives (AMBIGUOUS), and not at all once
 *     the source book re-extracts (ON MATCH bumps the source's updatedAt,
 *     destroying the twin while the victim's copy keeps the old timestamp).
 *   - Overwrites: pre-fix ON MATCH could OVERWRITE a victim's legitimate
 *     edge's properties in place. Deleting the (now invalid-provenance) edge
 *     also drops the underlying legitimate relationship; only a re-extraction
 *     of the victim book's chapters can restore it. Re-extraction is
 *     content-hash gated, so it requires the author to touch the chapter (or
 *     an operator to clear the Chapter node's contentHash).
 *  FALSE POSITIVES (legitimate data the range test may delete):
 *   - Edges written by a chapter the author has since DELETED (stale own
 *     data, not cross-book). Removing them is still sound cleanup — the
 *     referenced chapter no longer exists — but it is not contamination;
 *     the per-edge log lines make the distinction reviewable before
 *     --execute.
 *   - Timestamp-twin coincidence needs same type AND chapter AND same
 *     millisecond across books; twins alone never trigger deletion, so a
 *     coincidental twin can at worst mislabel a clean edge AMBIGUOUS.
 *
 * Continuity flags (Postgres) whose book+entities intersect a deleted edge's
 * endpoints are LISTED for manual review, never auto-deleted: a flag may
 * still be supported by remaining legitimate edges, and the next scan
 * recomputes flags from the repaired graph anyway.
 *
 * Dry-run by default (prints every planned action). Pass --execute to apply.
 * Exits non-zero when anomalies / ambiguous edges / touched flags need manual
 * review (both modes), or when an execute-mode delete fails.
 *
 * Run:  npx tsx --env-file=.env scripts/repair-cross-book-edges.ts [--execute]
 */
import "dotenv/config";

// ─── Pure classification (unit-tested; no I/O) ──────────────────────────────

export interface EdgeRecord {
  /** Neo4j internal id(r), stringified — used only for targeted deletion. */
  edgeId: string;
  /** Relationship type, e.g. ALLIED_WITH. */
  type: string;
  /** Shared bookId of both endpoints. */
  bookId: string;
  fromName: string;
  toName: string;
  fromLabels: string[];
  toLabels: string[];
  /** r.chapter — may be a float (driver wrote JS numbers), or null. */
  chapter: number | null;
  /** r.updatedAt ISO string as written by upsertRelationship, or null. */
  updatedAt: string | null;
}

export type EdgeVerdict = "clean" | "contaminated" | "ambiguous" | "anomaly";

export interface ClassifiedEdge extends EdgeRecord {
  verdict: EdgeVerdict;
  reasons: string[];
  /** OTHER books holding a byte-identical (type, chapter, updatedAt) edge. */
  twinBookIds: string[];
}

/** Normalize a possibly-float chapter value (driver wrote 6.0) to an int. */
function chapterInt(chapter: number): number {
  return Math.trunc(chapter);
}

/**
 * Classify every same-book relationship edge per the header's heuristic.
 * `chaptersByBook` maps bookId → the set of chapter numbers that exist in
 * Postgres for that book (story-bible chapter 0 is implied, always legit).
 */
export function classifyEdges(
  edges: readonly EdgeRecord[],
  chaptersByBook: ReadonlyMap<string, ReadonlySet<number>>
): ClassifiedEdge[] {
  // Timestamp-twin groups: identical (type, chapter, updatedAt) across edges.
  // One pre-fix contaminating MERGE stamped exactly these three onto every
  // matched pair in a single call, so a group spanning >1 book is the
  // signature of one cross-book write event.
  const twinGroups = new Map<string, EdgeRecord[]>();
  for (const e of edges) {
    if (e.updatedAt === null || e.chapter === null) continue;
    const key = `${e.type}|${chapterInt(e.chapter)}|${e.updatedAt}`;
    twinGroups.set(key, [...(twinGroups.get(key) ?? []), e]);
  }

  const inRange = (e: EdgeRecord): boolean | null => {
    const known = chaptersByBook.get(e.bookId);
    if (!known || e.chapter === null) return null;
    const ch = chapterInt(e.chapter);
    return ch === 0 || known.has(ch);
  };

  return edges.map((e): ClassifiedEdge => {
    const reasons: string[] = [];
    const known = chaptersByBook.get(e.bookId);

    let twinBookIds: string[] = [];
    if (e.updatedAt !== null && e.chapter !== null) {
      const key = `${e.type}|${chapterInt(e.chapter)}|${e.updatedAt}`;
      twinBookIds = [
        ...new Set(
          (twinGroups.get(key) ?? [])
            .filter((t) => t.bookId !== e.bookId)
            .map((t) => t.bookId)
        ),
      ];
    }

    if (!known) {
      reasons.push(
        `book ${e.bookId} has no chapters in Postgres (deleted book / orphaned graph)`
      );
      return { ...e, verdict: "anomaly", reasons, twinBookIds };
    }
    if (e.chapter === null) {
      reasons.push(
        "edge has no r.chapter (upsertRelationship always stamps one — foreign/manual write)"
      );
      return { ...e, verdict: "anomaly", reasons, twinBookIds };
    }

    const ch = chapterInt(e.chapter);
    if (ch !== 0 && !known.has(ch)) {
      reasons.push(
        `chapter ${ch} does not exist in book ${e.bookId} (chapters: ${[...known].sort((a, b) => a - b).join(",") || "none"})`
      );
      if (twinBookIds.length > 0) {
        reasons.push(
          `byte-identical (type, chapter, updatedAt) twin in book(s) ${twinBookIds.join(", ")} — forensic confirmation of a cross-book write`
        );
      } else {
        reasons.push(
          "no surviving timestamp twin — aged contamination, or stale edge from a since-deleted chapter (see script header)"
        );
      }
      return { ...e, verdict: "contaminated", reasons, twinBookIds };
    }

    // In range. Twins across books → one contaminating write touched several
    // books; if THIS book is the only in-range one, it is the presumed source.
    if (twinBookIds.length > 0) {
      const key = `${e.type}|${ch}|${e.updatedAt}`;
      const group = twinGroups.get(key) ?? [];
      const inRangeBooks = new Set(
        group.filter((t) => inRange(t) === true).map((t) => t.bookId)
      );
      if (inRangeBooks.size <= 1) {
        reasons.push(
          `presumed source of a contaminating write also seen out-of-range in book(s) ${twinBookIds.join(", ")}`
        );
        return { ...e, verdict: "clean", reasons, twinBookIds };
      }
      reasons.push(
        `in-range timestamp twin spans multiple in-range books (${[...inRangeBooks].join(", ")}) — source vs in-range victim undecidable, manual review`
      );
      return { ...e, verdict: "ambiguous", reasons, twinBookIds };
    }

    return { ...e, verdict: "clean", reasons, twinBookIds };
  });
}

export interface FlagLite {
  id: string;
  bookId: string;
  type: string;
  status: string;
  /** JSON array of entity names (ContinuityFlag.entities). */
  entities: string;
  description?: string;
}

/**
 * Continuity flags that may have been supported by a deleted edge: same book,
 * and at least one flag entity matches a deleted edge endpoint name. Listed
 * for MANUAL review only — a flag may still be supported by surviving
 * legitimate edges, and the next scan recomputes flags from the repaired
 * graph. Unparseable entities JSON is skipped (defensive).
 */
export function flagsTouchedByDeletions(
  flags: readonly FlagLite[],
  deleted: readonly ClassifiedEdge[]
): FlagLite[] {
  if (deleted.length === 0) return [];
  const endpointsByBook = new Map<string, Set<string>>();
  for (const e of deleted) {
    const set = endpointsByBook.get(e.bookId) ?? new Set<string>();
    set.add(e.fromName);
    set.add(e.toName);
    endpointsByBook.set(e.bookId, set);
  }
  return flags.filter((f) => {
    const endpoints = endpointsByBook.get(f.bookId);
    if (!endpoints) return false;
    let names: unknown;
    try {
      names = JSON.parse(f.entities);
    } catch {
      return false;
    }
    if (!Array.isArray(names)) return false;
    return names.some((n) => typeof n === "string" && endpoints.has(n));
  });
}

// ─── I/O runner ─────────────────────────────────────────────────────────────

const TAG = "[repair-cross-book-edges]";

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  console.log(
    `${TAG} mode: ${execute ? "EXECUTE" : "DRY-RUN (pass --execute to apply)"}`
  );

  const { withSession } = await import("../src/lib/graph/neo4j-client");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = (await import("pg")).default;

  if (!process.env.DATABASE_URL) {
    throw new Error(`${TAG} DATABASE_URL not set`);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return v;
    if (typeof v === "object" && v !== null && "toNumber" in v) {
      return (v as { toNumber: () => number }).toNumber();
    }
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  try {
    // 1. Every book's real chapter set (Postgres is the source of truth).
    const chapterRows = await db.chapter.findMany({
      select: { bookId: true, chapterNumber: true },
    });
    const chaptersByBook = new Map<string, Set<number>>();
    for (const row of chapterRows) {
      const set = chaptersByBook.get(row.bookId) ?? new Set<number>();
      set.add(row.chapterNumber);
      chaptersByBook.set(row.bookId, set);
    }
    console.log(
      `${TAG} loaded chapter sets for ${chaptersByBook.size} book(s) from Postgres`
    );

    // 2. Every same-book relationship edge in Neo4j (+ cross-book endpoint
    //    anomalies, which even the pre-fix WHERE could not create).
    const { edges, crossEndpoint } = await withSession("READ", async (session) => {
      const sameBook = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE a.bookId IS NOT NULL AND b.bookId IS NOT NULL
           AND a.bookId = b.bookId
         RETURN id(r) AS edgeId, type(r) AS relType, a.bookId AS bookId,
                a.name AS fromName, b.name AS toName,
                labels(a) AS fromLabels, labels(b) AS toLabels,
                r.chapter AS chapter, r.updatedAt AS updatedAt`
      );
      const cross = await session.run(
        `MATCH (a)-[r]->(b)
         WHERE a.bookId IS NOT NULL AND b.bookId IS NOT NULL
           AND a.bookId <> b.bookId
         RETURN id(r) AS edgeId, type(r) AS relType,
                a.bookId AS aBook, b.bookId AS bBook,
                a.name AS fromName, b.name AS toName`
      );
      return {
        edges: sameBook.records.map((rec): EdgeRecord => ({
          edgeId: String(toNum(rec.get("edgeId"))),
          type: String(rec.get("relType")),
          bookId: String(rec.get("bookId")),
          fromName: String(rec.get("fromName")),
          toName: String(rec.get("toName")),
          fromLabels: (rec.get("fromLabels") as string[]) ?? [],
          toLabels: (rec.get("toLabels") as string[]) ?? [],
          chapter: toNum(rec.get("chapter")),
          updatedAt:
            rec.get("updatedAt") == null ? null : String(rec.get("updatedAt")),
        })),
        crossEndpoint: cross.records.map(
          (rec) =>
            `edge id ${toNum(rec.get("edgeId"))} ${rec.get("fromName")}-[${rec.get("relType")}]->${rec.get("toName")} spans books ${rec.get("aBook")} <> ${rec.get("bBook")}`
        ),
      };
    });
    console.log(
      `${TAG} scanned ${edges.length} same-book relationship edge(s), ${crossEndpoint.length} cross-book-endpoint anomaly edge(s)`
    );

    // 3. Classify.
    const classified = classifyEdges(edges, chaptersByBook);
    const contaminated = classified.filter((e) => e.verdict === "contaminated");
    const ambiguous = classified.filter((e) => e.verdict === "ambiguous");
    const anomalies = classified.filter((e) => e.verdict === "anomaly");
    const presumedSources = classified.filter(
      (e) => e.verdict === "clean" && e.reasons.length > 0
    );

    const describe = (e: ClassifiedEdge): string =>
      `book=${e.bookId} (${e.fromLabels.join("|")}) ${e.fromName} -[${e.type} chapter=${e.chapter} updatedAt=${e.updatedAt}]-> (${e.toLabels.join("|")}) ${e.toName} [edge id ${e.edgeId}]`;

    for (const e of contaminated) {
      console.log(`\n${execute ? "DELETE" : "WOULD DELETE"} ${describe(e)}`);
      for (const r of e.reasons) console.log(`  reason: ${r}`);
    }
    for (const e of presumedSources) {
      console.log(`\nKEEP (presumed source) ${describe(e)}`);
      for (const r of e.reasons) console.log(`  note: ${r}`);
    }
    for (const e of ambiguous) {
      console.log(`\nAMBIGUOUS (manual review, NOT deleted) ${describe(e)}`);
      for (const r of e.reasons) console.log(`  reason: ${r}`);
    }
    for (const e of anomalies) {
      console.log(`\nANOMALY (manual review, NOT deleted) ${describe(e)}`);
      for (const r of e.reasons) console.log(`  reason: ${r}`);
    }
    for (const line of crossEndpoint) {
      console.log(`\nANOMALY (cross-book endpoints, manual review, NOT deleted) ${line}`);
    }

    // 4. Continuity flags possibly supported by the edges being removed —
    //    listed for manual review, never auto-deleted.
    const affectedBooks = [...new Set(contaminated.map((e) => e.bookId))];
    let touchedFlags: FlagLite[] = [];
    if (affectedBooks.length > 0) {
      const flagRows = await db.continuityFlag.findMany({
        where: { bookId: { in: affectedBooks } },
        select: {
          id: true,
          bookId: true,
          type: true,
          status: true,
          entities: true,
          description: true,
        },
      });
      touchedFlags = flagsTouchedByDeletions(flagRows, contaminated);
      for (const f of touchedFlags) {
        console.log(
          `\nFLAG REVIEW (NOT deleted) ${f.id} book=${f.bookId} type=${f.type} status=${f.status} entities=${f.entities}` +
            `\n  supporting edge(s) removed by this repair — re-scan the book, then resolve or keep manually`
        );
      }
    }

    // 5. Apply.
    let deleted = 0;
    let deleteFailures = 0;
    if (execute && contaminated.length > 0) {
      const ids = contaminated.map((e) => Number(e.edgeId));
      await withSession("WRITE", async (session) => {
        const result = await session.run(
          `UNWIND $ids AS eid
           MATCH ()-[r]->()
           WHERE id(r) = eid
           DELETE r`,
          { ids }
        );
        deleted = toNum(result.summary.counters.updates().relationshipsDeleted) ?? 0;
      });
      deleteFailures = contaminated.length - deleted;
      if (deleteFailures > 0) {
        console.log(
          `\n${TAG} WARN only ${deleted}/${contaminated.length} edge(s) deleted — ids may have shifted since the read; re-run the script`
        );
      }
    }

    // 6. Loud aggregate summary + exit code. Anything requiring manual review
    //    (ambiguous / anomalies / touched flags / partial delete) is an
    //    anomaly → non-zero exit in BOTH modes so it can't be missed.
    const reviewCount =
      ambiguous.length + anomalies.length + crossEndpoint.length + touchedFlags.length;
    console.log(
      `\n${TAG} ${execute ? "REPAIR" : "DRY-RUN"} SUMMARY: ` +
        `${contaminated.length} contaminated edge(s) ${execute ? `deleted (${deleted} confirmed)` : "would be deleted"}, ` +
        `${presumedSources.length} presumed-source edge(s) kept, ` +
        `${ambiguous.length} ambiguous, ${anomalies.length + crossEndpoint.length} anomaly edge(s), ` +
        `${touchedFlags.length} continuity flag(s) need review` +
        `${execute ? "" : " (nothing was written; re-run with --execute to apply)"}`
    );
    if (reviewCount > 0 || deleteFailures > 0) {
      console.log(
        `${TAG} exit 1: ${reviewCount} item(s) need manual review${deleteFailures > 0 ? `, ${deleteFailures} delete(s) unconfirmed` : ""}`
      );
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
    await pool.end();
    const { closeNeo4j } = await import("../src/lib/graph/neo4j-client");
    await closeNeo4j();
  }
}

// Only run when invoked directly (npx tsx scripts/repair-cross-book-edges.ts);
// tests import the pure classifiers above without touching any database.
const isDirectRun = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("repair-cross-book-edges.ts");
if (isDirectRun) {
  main().catch((error) => {
    console.error(`${TAG} failed:`, error);
    process.exitCode = 1;
  });
}
