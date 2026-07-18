/**
 * D-16 repair: collapse duplicate Document rows for one chapter.
 *
 * The unguarded check-then-create in the chapter-content PUT could mint TWO
 * documents rows for the same (bookId, type, chapterNumber) — same
 * storage_key, independent current_version — after which GET and PUT landed
 * on different rows nondeterministically and the CAS 409 could never fire
 * (silent lost-update). This script collapses each such group to ONE row so
 * the new @@unique([bookId, type, chapterNumber]) constraint can be pushed.
 *
 * Per duplicate group (chapterNumber and bookId both non-null):
 *   - KEEP the oldest row (createdAt asc, id asc tiebreak) — the row the
 *     now-deterministic findByType (orderBy createdAt asc) resolves;
 *   - lift its currentVersion to the MAX across the group so no client's
 *     stamped version can silently overwrite or 409-forever;
 *   - re-parent the extras' DocumentVersion rows to the kept row, renumbering
 *     (documentId, version) collisions sequentially past the group max;
 *   - delete the extra document rows (plain DB deletes — storage is
 *     deliberately untouched: duplicates share the SAME live storage_key as
 *     the kept row, and moved version snapshots stay readable at their
 *     original storageKey paths / via the live-key fallback in readPinned).
 *
 * Dry-run by default (prints every planned action). Pass --execute to apply.
 *
 * Run:  npx tsx --env-file=.env scripts/repair-duplicate-documents.ts [--execute]
 */
import "dotenv/config";

export interface DocumentRowLite {
  id: string;
  currentVersion: number;
  createdAt: Date;
}

export interface VersionRowLite {
  id: string;
  documentId: string;
  version: number;
}

export interface VersionMove {
  versionRowId: string;
  fromDocumentId: string;
  fromVersion: number;
  toVersion: number;
}

export interface GroupRepairPlan {
  keepId: string;
  newCurrentVersion: number;
  moves: VersionMove[];
  deleteDocumentIds: string[];
}

/**
 * Pure planner for one duplicate group. Keeps the oldest row, lifts its
 * currentVersion to the group max, re-parents every extra's version rows
 * (renumbering collisions past the highest version number in the group), and
 * schedules the extras for deletion. Deterministic: rows are processed in
 * createdAt order with id as tiebreak.
 */
export function planDocumentGroupRepair(
  docs: readonly DocumentRowLite[],
  versions: readonly VersionRowLite[]
): GroupRepairPlan {
  const sorted = [...docs].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
  const kept = sorted[0];
  const extras = sorted.slice(1);

  const newCurrentVersion = Math.max(...docs.map((d) => d.currentVersion));

  // Version numbers already taken under the kept row; collisions renumber
  // sequentially past the highest version number seen anywhere in the group.
  const usedVersions = new Set(
    versions.filter((v) => v.documentId === kept.id).map((v) => v.version)
  );
  let nextFreeVersion =
    Math.max(0, ...versions.map((v) => v.version)) + 1;

  const moves: VersionMove[] = [];
  for (const extra of extras) {
    const extraVersions = versions
      .filter((v) => v.documentId === extra.id)
      .sort((a, b) => a.version - b.version);
    for (const row of extraVersions) {
      const toVersion = usedVersions.has(row.version)
        ? nextFreeVersion++
        : row.version;
      usedVersions.add(toVersion);
      moves.push({
        versionRowId: row.id,
        fromDocumentId: extra.id,
        fromVersion: row.version,
        toVersion,
      });
    }
  }

  return {
    keepId: kept.id,
    newCurrentVersion,
    moves,
    deleteDocumentIds: extras.map((e) => e.id),
  };
}

/** Group key for chapter-scoped documents. */
function groupKey(d: { bookId: string; type: string; chapterNumber: number }): string {
  return `${d.bookId}|${d.type}|${d.chapterNumber}`;
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const pg = (await import("pg")).default;

  if (!process.env.DATABASE_URL) {
    throw new Error("[repair-duplicate-documents] DATABASE_URL not set");
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  console.log(
    `[repair-duplicate-documents] mode: ${execute ? "EXECUTE" : "DRY-RUN (pass --execute to apply)"}`
  );

  try {
    // Chapter-scoped rows only; series docs (bookId null) and non-chapter docs
    // (chapterNumber null) are exempt from the unique and never touched here.
    const candidates = await db.document.findMany({
      where: { bookId: { not: null }, chapterNumber: { not: null } },
      select: {
        id: true,
        bookId: true,
        type: true,
        chapterNumber: true,
        currentVersion: true,
        createdAt: true,
        storageKey: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const groups = new Map<string, typeof candidates>();
    for (const doc of candidates) {
      const key = groupKey({
        bookId: doc.bookId!,
        type: doc.type,
        chapterNumber: doc.chapterNumber!,
      });
      groups.set(key, [...(groups.get(key) ?? []), doc]);
    }

    const duplicateGroups = [...groups.entries()].filter(
      ([, docs]) => docs.length > 1
    );
    console.log(
      `[repair-duplicate-documents] scanned ${candidates.length} chapter-scoped documents, found ${duplicateGroups.length} duplicate group(s)`
    );

    for (const [key, docs] of duplicateGroups) {
      const versions = await db.documentVersion.findMany({
        where: { documentId: { in: docs.map((d) => d.id) } },
        select: { id: true, documentId: true, version: true },
      });
      const plan = planDocumentGroupRepair(docs, versions);

      console.log(`\n[group ${key}]`);
      for (const doc of docs) {
        console.log(
          `  row ${doc.id} createdAt=${doc.createdAt.toISOString()} currentVersion=${doc.currentVersion} storageKey=${doc.storageKey}`
        );
      }
      console.log(
        `  KEEP ${plan.keepId} -> currentVersion=${plan.newCurrentVersion} (group max)`
      );
      for (const move of plan.moves) {
        const renumbered = move.fromVersion !== move.toVersion;
        console.log(
          `  MOVE version row ${move.versionRowId} (${move.fromDocumentId} v${move.fromVersion}) -> ${plan.keepId} v${move.toVersion}${renumbered ? " (renumbered; snapshot stays at its original storageKey path)" : ""}`
        );
      }
      for (const id of plan.deleteDocumentIds) {
        console.log(
          `  DELETE document row ${id} (DB row only — shared storage_key left untouched)`
        );
      }

      if (!execute) continue;

      await db.$transaction(async (tx) => {
        for (const move of plan.moves) {
          await tx.documentVersion.update({
            where: { id: move.versionRowId },
            data: { documentId: plan.keepId, version: move.toVersion },
          });
        }
        await tx.document.update({
          where: { id: plan.keepId },
          data: { currentVersion: plan.newCurrentVersion },
        });
        await tx.document.deleteMany({
          where: { id: { in: plan.deleteDocumentIds } },
        });
      });
      console.log(`  applied.`);
    }

    console.log(
      `\n[repair-duplicate-documents] done${execute ? "" : " (dry-run — nothing was written)"}`
    );
  } finally {
    await db.$disconnect();
    await pool.end();
  }
}

// Only run when invoked directly (npx tsx scripts/repair-duplicate-documents.ts);
// tests import the pure planner above without touching a database.
const isDirectRun = process.argv[1]
  ?.replace(/\\/g, "/")
  .endsWith("repair-duplicate-documents.ts");
if (isDirectRun) {
  main().catch((error) => {
    console.error("[repair-duplicate-documents] failed:", error);
    process.exitCode = 1;
  });
}
