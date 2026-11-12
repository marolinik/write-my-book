/**
 * Wave 5 Task 6: the only names the export download routes serve — what
 * sanitizeExportFilename produces (an ASCII stem, a timestamp and a known
 * extension). No traversal, no separators, and nothing that could break the
 * Content-Disposition header.
 */
const EXPORT_FILENAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:docx|pdf|epub|md)$/;

export function isExportFilename(filename: string | undefined): filename is string {
  return !!filename && EXPORT_FILENAME.test(filename) && !filename.includes("..");
}
