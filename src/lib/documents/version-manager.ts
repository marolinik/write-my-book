import { db } from "@/lib/db";
import { countWords } from "@/lib/utils";
import type { StorageAdapter } from "@/lib/storage/types";
import { getVersionStoragePath } from "./storage-keys";
import { VersionConflictError } from "./errors";

export class VersionManager {
  constructor(
    private documentId: string,
    private storage: StorageAdapter
  ) {}

  /**
   * Create a new version snapshot of the document content.
   * Uses atomic increment to prevent race conditions with parallel agents.
   *
   * When `expectedVersion` is provided, the increment is a compare-and-swap:
   * it only applies if `currentVersion` still equals `expectedVersion`,
   * otherwise a `VersionConflictError` is thrown and nothing is written.
   * Callers omitting `expectedVersion` keep unconditional last-write-wins.
   */
  async createVersion(
    content: string,
    changeType: string,
    changeSource: string,
    expectedVersion?: number
  ) {
    // Atomic: increment version and create record in a transaction
    const result = await db.$transaction(async (tx) => {
      // Atomically increment currentVersion, guarded by the CAS when
      // expectedVersion is supplied (updateMany supports non-unique where)
      const updated = await tx.document.updateMany({
        where: {
          id: this.documentId,
          ...(expectedVersion !== undefined && {
            currentVersion: expectedVersion,
          }),
        },
        data: { currentVersion: { increment: 1 } },
      });

      if (updated.count === 0 && expectedVersion !== undefined) {
        throw new VersionConflictError(this.documentId);
      }

      // updateMany returns no row — re-read for the new version number.
      // For unguarded callers a missing document throws here (P2025),
      // matching the previous tx.document.update behavior.
      const doc = await tx.document.findUniqueOrThrow({
        where: { id: this.documentId },
      });

      const nextVersion = doc.currentVersion;
      const versionPath = getVersionStoragePath(this.documentId, nextVersion);

      // Write version content to S3
      await this.storage.write(versionPath, content);

      // Create version record in DB
      const version = await tx.documentVersion.create({
        data: {
          documentId: this.documentId,
          version: nextVersion,
          storageKey: versionPath,
          changeType,
          changeSource,
          wordCount: countWords(content),
        },
      });

      return version;
    });

    return result;
  }

  /**
   * List all versions ordered newest first.
   */
  async getVersions() {
    return db.documentVersion.findMany({
      where: { documentId: this.documentId },
      orderBy: { version: "desc" },
    });
  }

  /**
   * Read the content of a specific version from S3.
   */
  async getVersionContent(version: number): Promise<string | null> {
    const versionPath = getVersionStoragePath(this.documentId, version);
    return this.storage.read(versionPath);
  }

  /**
   * Restore a previous version by creating a new version with the old content.
   */
  async restoreVersion(version: number, changeSource: string) {
    const content = await this.getVersionContent(version);
    if (content === null) {
      throw new Error(`Version ${version} content not found`);
    }

    // Create a new version with the restored content
    return this.createVersion(content, "revision", changeSource);
  }

  /**
   * Simple line-based diff between two versions.
   * Returns an array of diff lines with type: added, removed, or unchanged.
   */
  async diffVersions(fromVersion: number, toVersion: number) {
    const fromContent = await this.getVersionContent(fromVersion);
    const toContent = await this.getVersionContent(toVersion);

    if (fromContent === null || toContent === null) {
      throw new Error("One or both version contents not found");
    }

    return computeLineDiff(fromContent, toContent);
  }
}

export type DiffLine = {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber?: number;
};

/**
 * Compute a simple line-based diff using longest common subsequence.
 */
export function computeLineDiff(
  oldText: string,
  newText: string
): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: "unchanged",
        content: oldLines[i - 1],
        lineNumber: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({
        type: "added",
        content: newLines[j - 1],
        lineNumber: j,
      });
      j--;
    } else {
      result.unshift({
        type: "removed",
        content: oldLines[i - 1],
        lineNumber: i,
      });
      i--;
    }
  }

  return result;
}
