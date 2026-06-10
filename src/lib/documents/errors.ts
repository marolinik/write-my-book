/**
 * Thrown when an optimistic-lock (compare-and-swap) write is rejected because
 * the document's currentVersion no longer matches the caller's expectedVersion.
 *
 * Only guarded callers (those passing expectedVersion) can ever see this —
 * agent writes, imports, finding applies, and restores stay unguarded and keep
 * last-write-wins semantics.
 */
export class VersionConflictError extends Error {
  constructor(public documentId: string) {
    super("version_conflict");
    this.name = "VersionConflictError";
  }
}
