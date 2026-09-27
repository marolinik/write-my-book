/**
 * How large a manuscript upload may be (R-286: .md/.txt/.docx up to 20 MB).
 *
 * The file limit alone was not the whole story. Every request the middleware
 * matches goes through Next's proxy, which clones the body and cuts it at
 * `experimental.proxyClientMaxBodySize` — 10 MB unless configured. Past that
 * the route read a truncated multipart body, `req.formData()` threw, and a
 * 14 MB manuscript the dropzone promised to accept came back as a 500
 * "Preview failed" (UAT P6-S01, P6-S06). next.config.ts raises the cap to
 * MAX_UPLOAD_REQUEST_BYTES, and a contract test keeps the two in step.
 */

export const MAX_IMPORT_FILE_MB = 20;
export const MAX_IMPORT_FILE_BYTES = MAX_IMPORT_FILE_MB * 1024 * 1024;

/**
 * The largest request body an upload route accepts: one file at the limit
 * plus multipart framing, with room to spare. The import wizard sends one
 * file per request, so this never has to hold a whole selection.
 */
export const MAX_UPLOAD_REQUEST_BYTES = 25 * 1024 * 1024;

export interface SizePartition<T> {
  accepted: T[];
  oversized: T[];
}

/** Splits a selection into files within the per-file limit and files over it. */
export function partitionBySize<T extends { size: number }>(
  files: readonly T[]
): SizePartition<T> {
  return {
    accepted: files.filter((f) => f.size <= MAX_IMPORT_FILE_BYTES),
    oversized: files.filter((f) => f.size > MAX_IMPORT_FILE_BYTES),
  };
}
