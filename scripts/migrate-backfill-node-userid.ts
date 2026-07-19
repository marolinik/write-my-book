/**
 * D-71 data remediation: backfill the owning tenant onto legacy Neo4j NODES that
 * predate the RC-6 tenant-isolation fix.
 *
 * RC-6 stamped `userId` onto every graph node/edge going forward, but pre-fix
 * nodes carry only `bookId`. The RC-6 read guard (graph-queries.userGuard) keys
 * off NODE userId, so an edge-only backfill restores NO isolation — the nodes
 * must be stamped too. This is the NODE companion to
 * scripts/migrate-purge-contaminated-edges.ts (edges); it is deliberately a
 * SEPARATE script because the owner resolution is trivially unambiguous for a
 * node (one bookId → one Book.userId) whereas the edge script must reason about
 * cross-book endpoints, series exemption, and case-variant merges.
 *
 *   BACKFILL — every node WHERE n.bookId IS NOT NULL AND n.userId IS NULL gets
 *   n.userId = owner of n.bookId (bookId → Book.userId in Postgres). Book.userId
 *   is a single non-null column, so the owner is ALWAYS unambiguous when the
 *   Book row exists.
 *
 * ── Safety model ────────────────────────────────────────────────────────────
 *  - DRY-RUN IS THE DEFAULT. With no flag (or --dry-run) nothing is written; the
 *    script censuses the node population, writes a full report to
 *    cowork/bulletproof-qa-2026-07-17/evidence/node-userid-census.md, and exits
 *    NON-ZERO if any unstamped node is found (so CI / the team-lead notices).
 *  - --execute is the ONLY write path. It NEVER overwrites an existing non-null
 *    n.userId (guarded in BOTH the read filter and the write's `id(n)` MATCH), so
 *    it is additive and idempotent — a re-run after the first pass is a no-op.
 *  - A node whose bookId is absent from Postgres is an ANOMALY: reported, never
 *    guessed, never written.
 *  - The classification logic is pure (no I/O) and unit-tested; the I/O runner
 *    below only reads Postgres and reads/writes the graph. Every dynamic value is
 *    $param-bound — the injection boundary (sanitizeRelationshipType /
 *    escapeLabelForQuery) is not touched.
 *
 * Run (dry-run):  npx tsx --env-file=.env scripts/migrate-backfill-node-userid.ts
 * Run (apply):    npx tsx --env-file=.env scripts/migrate-backfill-node-userid.ts --execute
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ─── Pure classification (unit-tested; no I/O) ──────────────────────────────

/** A book-scoped node as read from Neo4j, with its current tenant stamp. */
export interface NodeToClassify {
  bookId: string;
  /** Current n.userId — null when the node is unstamped (the legacy case). */
  userId: string | null;
}

export type NodeBackfillDecision =
  /** Unstamped node whose book resolves — stamp with the book's owner. */
  | { kind: "backfill"; userId: string; reason: string }
  /** Already carries a userId — never overwritten (idempotent no-op). */
  | { kind: "already_stamped"; reason: string }
  /** Unstamped node whose book is absent from Postgres — never guessed. */
  | { kind: "anomaly"; reason: string };

/**
 * Decide how to stamp one node. The owner is unambiguous: a node has exactly one
 * bookId, and Book.userId is a single non-null column, so if the book resolves
 * the owner is known. Conservative invariants (pinned by unit tests):
 *   - a node that ALREADY carries a userId is left untouched (never overwrite);
 *   - a node whose book is absent from Postgres is an anomaly (never guess).
 * `ownerByBook` maps bookId → owning userId (Book.id → Book.userId in Postgres).
 */
export function decideNodeUserIdBackfill(
  node: NodeToClassify,
  ownerByBook: ReadonlyMap<string, string>
): NodeBackfillDecision {
  // Never overwrite an existing stamp — checked BEFORE book resolution so a
  // stamped node on an orphaned book is still a no-op, not an anomaly.
  if (node.userId !== null) {
    return {
      kind: "already_stamped",
      reason: `node already carries userId ${node.userId} — never overwritten`,
    };
  }
  const owner = ownerByBook.get(node.bookId);
  if (owner === undefined) {
    return {
      kind: "anomaly",
      reason: `book ${node.bookId} not found in Postgres (deleted book / orphaned graph) — owner not guessed`,
    };
  }
  return {
    kind: "backfill",
    userId: owner,
    reason: `owner of book ${node.bookId}`,
  };
}

// ─── I/O runner ─────────────────────────────────────────────────────────────

const TAG = "[migrate-backfill-node-userid]";
const CENSUS_PATH = join(
  "cowork",
  "bulletproof-qa-2026-07-17",
  "evidence",
  "node-userid-census.md"
);
const SAMPLE_LIMIT = 20;

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

interface NodeRow {
  nodeId: string;
  bookId: string;
  userId: string | null;
  labels: string[];
  name: string | null;
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const report: Report = { lines: [] };

  line(report, `# Node userId backfill census`);
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
    // 1. Book owner map (bookId → userId) — the source of truth for ownership.
    const bookRows = await db.book.findMany({
      select: { id: true, userId: true },
    });
    const ownerByBook = new Map<string, string>(
      bookRows.map((r) => [r.id, r.userId])
    );
    line(report, `Loaded owner for ${ownerByBook.size} book(s) from Postgres.`);
    line(report, "");

    // 2. Read every book-scoped, UNSTAMPED node (read-only). The `n.userId IS
    //    NULL` filter is the first never-overwrite layer.
    const nodeRows = await withSession("READ", async (session) => {
      const res = await session.run(
        `MATCH (n)
         WHERE n.bookId IS NOT NULL AND n.userId IS NULL
         RETURN id(n) AS nodeId, n.bookId AS bookId, n.userId AS userId,
                labels(n) AS labels, n.name AS name`
      );
      return res.records.map((rec): NodeRow => ({
        nodeId: String(toNum(rec.get("nodeId"))),
        bookId: String(rec.get("bookId")),
        userId: rec.get("userId") == null ? null : String(rec.get("userId")),
        labels: (rec.get("labels") as string[]) ?? [],
        name: rec.get("name") == null ? null : String(rec.get("name")),
      }));
    });

    // Total book-scoped node population (for the coverage denominator).
    const totalBookScoped = await withSession("READ", async (session) => {
      const res = await session.run(
        `MATCH (n) WHERE n.bookId IS NOT NULL RETURN count(n) AS total`
      );
      return toNum(res.records[0]?.get("total")) ?? 0;
    });

    // 3. Classify.
    const backfillable: Array<{ node: NodeRow; userId: string; reason: string }> = [];
    const anomalies: Array<{ node: NodeRow; reason: string }> = [];
    for (const node of nodeRows) {
      const decision = decideNodeUserIdBackfill(node, ownerByBook);
      if (decision.kind === "backfill") {
        backfillable.push({ node, userId: decision.userId, reason: decision.reason });
      } else if (decision.kind === "anomaly") {
        anomalies.push({ node, reason: decision.reason });
      }
      // `already_stamped` cannot occur here (the read filters userId IS NULL);
      // the branch exists so the pure classifier proves the invariant in tests.
    }

    // 4. Report.
    const describe = (n: NodeRow): string =>
      `(${n.labels.join("|")}) ${n.name ?? "<unnamed>"} [book ${n.bookId}, node id ${n.nodeId}]`;

    line(report, `## Book-scoped nodes missing userId (legacy, pre-RC-6)`);
    line(report, "");
    line(report, `- Total book-scoped nodes: **${totalBookScoped}**`);
    line(report, `- Unstamped (userId IS NULL): **${nodeRows.length}**`);
    line(report, `- Backfillable: **${backfillable.length}**`);
    line(report, `- Anomaly (book unresolved, kept, manual review): **${anomalies.length}**`);
    line(report, "");
    if (backfillable.length > 0) {
      line(report, `Sample of up to ${SAMPLE_LIMIT} backfills ${execute ? "APPLIED" : "that WOULD be applied"}:`);
      line(report, "");
      for (const b of backfillable.slice(0, SAMPLE_LIMIT)) {
        line(
          report,
          `- ${execute ? "SET" : "WOULD SET"} n.userId=${b.userId} on ${describe(b.node)} — ${b.reason}`
        );
      }
      line(report, "");
    }
    for (const a of anomalies) {
      line(
        report,
        `- ANOMALY (NOT written) ${describe(a.node)} — ${a.reason}`
      );
    }
    line(report, "");

    // 5. Apply (execute only). The `n.userId IS NULL` guard in the write MATCH is
    //    the second never-overwrite layer: a node stamped between the read and
    //    this write is skipped, keeping the run idempotent.
    let stampedNodes = 0;
    if (execute && backfillable.length > 0) {
      const rows = backfillable.map((b) => ({
        nodeId: Number(b.node.nodeId),
        userId: b.userId,
      }));
      await withSession("WRITE", async (session) => {
        const result = await session.run(
          `UNWIND $rows AS row
           MATCH (n) WHERE id(n) = row.nodeId AND n.userId IS NULL
           SET n.userId = row.userId`,
          { rows }
        );
        stampedNodes = toNum(result.summary.counters.updates().propertiesSet) ?? 0;
      });
    }

    // 6. Summary + exit code.
    const unstampedFound = backfillable.length + anomalies.length;
    line(report, `## Summary`);
    line(report, "");
    line(
      report,
      `${execute ? "EXECUTE" : "DRY-RUN"}: ` +
        `${backfillable.length} node(s) ${execute ? `stamped (${stampedNodes} prop(s) set)` : "would be stamped"}, ` +
        `${anomalies.length} anomaly (book unresolved, not written).`
    );
    if (!execute && unstampedFound > 0) {
      line(report, "");
      line(report, `Nothing was written. Re-run with --execute to apply.`);
    }
    line(report, "");

    // Persist the census report.
    mkdirSync(dirname(CENSUS_PATH), { recursive: true });
    writeFileSync(CENSUS_PATH, report.lines.join("\n"), "utf8");
    console.log(`${TAG} census written to ${CENSUS_PATH}`);

    // Exit non-zero: dry-run if ANY unstamped node found; execute if anomalies
    // still need manual review.
    if (!execute && unstampedFound > 0) {
      console.log(`${TAG} exit 1: ${unstampedFound} unstamped node(s) found (dry-run)`);
      process.exitCode = 1;
    } else if (execute && anomalies.length > 0) {
      console.log(`${TAG} exit 1: ${anomalies.length} anomaly node(s) still need manual review after execute`);
      process.exitCode = 1;
    } else {
      console.log(`${TAG} exit 0: all book-scoped nodes carry a userId`);
    }
  } finally {
    await db.$disconnect();
    await pool.end();
    await closeNeo4j();
  }
}

// Only run when invoked directly; tests import the pure classifier above without
// touching any database.
const isDirectRun = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("migrate-backfill-node-userid.ts");
if (isDirectRun) {
  main().catch((error) => {
    console.error(`${TAG} failed:`, error);
    process.exitCode = 1;
  });
}
