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
 *   - copy each extra's DocumentVersion SNAPSHOT to the kept row's path, then
 *     re-parent the DB row, renumbering (documentId, version) collisions
 *     sequentially past the group max;
 *   - delete the extra document rows (plain DB deletes — the shared live
 *     storage_key is left untouched).
 *
 * CRITICAL — version snapshots are id-keyed, NOT shared across rows. A snapshot
 * lives at getVersionStoragePath(documentId, version) = `.versions/${id}/v${n}.md`,
 * and every read path (readPinned / getVersionContent / restoreVersion)
 * RECOMPUTES that path from (documentId, version) at read time. Re-parenting the
 * DB row alone would leave reads pointing at a never-written path → 404/500 (data
 * loss). So on --execute we PHYSICALLY COPY each snapshot to its new
 * (keepId, toVersion) path FIRST, then move the DB row. Storage is not
 * transactional, hence copy-before-DB-move; the original object is left in place
 * as a harmless orphan (no DB row references it after the extra row is deleted).
 * Dry-run performs NO storage writes.
 *
 * Dry-run by default (prints every planned action). Pass --execute to apply.
 *
 * Run:  npx tsx --env-file=.env scripts/repair-duplicate-documents.ts [--execute]
 */
import "dotenv/config";
import type { StorageAdapter } from "../src/lib/storage/types";
import { getVersionStoragePath } from "../src/lib/documents/storage-keys";

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

export interface SnapshotCopyResult {
  copied: VersionMove[];
  /** Source snapshot object was absent — nothing to copy (logged, not fatal). */
  missing: VersionMove[];
}

/**
 * Physically copy each moved version's SNAPSHOT object from its source path
 * (getVersionStoragePath(fromDocumentId, fromVersion)) to its destination path
 * under the kept row (getVersionStoragePath(keepId, toVersion)) — BEFORE the DB
 * re-parent, because every read path recomputes the path from (documentId,
 * version) and storage is not transactional. Idempotent and side-effect-free on
 * a missing source (recorded in `missing`). The source object is intentionally
 * left in place; after the extra document row is deleted nothing references it.
 */
export async function copyVersionSnapshots(
  storage: Pick<StorageAdapter, "read" | "write">,
  keepId: string,
  moves: readonly VersionMove[]
): Promise<SnapshotCopyResult> {
  const copied: VersionMove[] = [];
  const missing: VersionMove[] = [];
  for (const move of moves) {
    const fromPath = getVersionStoragePath(move.fromDocumentId, move.fromVersion);
    const toPath = getVersionStoragePath(keepId, move.toVersion);
    const content = await storage.read(fromPath);
    if (content === null) {
      missing.push(move);
      continue;
    }
    await storage.write(toPath, content);
    copied.push(move);
  }
  return { copied, missing };
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
  // Book-scoped storage is built lazily (getBookStorage needs S3 creds); import
  // here rather than at module top so the pure planner stays importable in
  // tests without loading the S3 client.
  const { getBookStorage } = await import("../src/lib/storage");

  console.log(
    `[repair-duplicate-documents] mode: ${execute ? "EXECUTE" : "DRY-RUN (pass --execute to apply)"}`
  );

  try {
    // Chapter-scoped rows only; series docs (bookId null) and non-chapter docs
    // (chapterNumber null) are exempt from the unique and never touched here.
    // book.userId is needed to build the book-scoped storage prefix for the
    // snapshot copy (`${userId}/${bookId}`).
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
        book: { select: { userId: true } },
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

    // Run-wide tallies for the loud aggregate summary. A missing source
    // snapshot means the DB row is re-parented to a path nothing ever wrote
    // (same 404 as pre-repair — not a regression, but silent), so surface it.
    let groupsRepaired = 0;
    let snapshotsCopied = 0;
    const missingSources: string[] = [];

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
          `  COPY+MOVE snapshot ${getVersionStoragePath(move.fromDocumentId, move.fromVersion)} -> ${getVersionStoragePath(plan.keepId, move.toVersion)}, then re-parent version row ${move.versionRowId}${renumbered ? ` (v${move.fromVersion}->v${move.toVersion} renumbered)` : ""}`
        );
      }
      for (const id of plan.deleteDocumentIds) {
        console.log(
          `  DELETE document row ${id} (DB row only — shared storage_key left untouched)`
        );
      }

      if (!execute) continue;

      // Storage first (not transactional): copy every moved snapshot to its new
      // (keepId, toVersion) path BEFORE the DB re-parent, so no read ever
      // resolves a path whose object was never written.
      const userId = docs[0].book?.userId;
      if (!userId) {
        console.log(`  SKIP group — book.userId unavailable (cannot scope storage)`);
        continue;
      }
      const storage = getBookStorage(userId, docs[0].bookId!);
      const { copied, missing } = await copyVersionSnapshots(
        storage,
        plan.keepId,
        plan.moves
      );
      for (const m of missing) {
        const path = getVersionStoragePath(m.fromDocumentId, m.fromVersion);
        console.log(`  WARN source snapshot absent, skipped copy: ${path}`);
        missingSources.push(`${key} :: ${m.fromDocumentId} v${m.fromVersion} -> ${path}`);
      }
      console.log(`  copied ${copied.length}/${plan.moves.length} snapshot(s)`);
      snapshotsCopied += copied.length;
      groupsRepaired++;

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

    // Loud aggregate summary so the apply-window operator sees the outcome
    // without scanning per-line WARNs. On --execute, a missing source is a
    // history-loss signal → non-zero exit code so the run is not treated as a
    // clean pass. Dry-run reports the same numbers but never changes exit code.
    const K = missingSources.length;
    if (execute) {
      console.log(
        `\n[repair-duplicate-documents] REPAIR SUMMARY: ${groupsRepaired} group(s) repaired, ${snapshotsCopied} snapshot(s) copied, ${K} MISSING source(s)${K > 0 ? " (lost history, see WARN lines above)" : ""}`
      );
      if (K > 0) {
        for (const m of missingSources) console.log(`  MISSING: ${m}`);
        process.exitCode = 1;
      }
    } else {
      console.log(
        `\n[repair-duplicate-documents] DRY-RUN SUMMARY: ${duplicateGroups.length} duplicate group(s) would be repaired (nothing written; re-run with --execute to apply)`
      );
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
