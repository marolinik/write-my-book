import type { Shelf, ShelfBookInput } from "./types";

const COMPLETED_STATUSES: ReadonlySet<string> = new Set(["complete", "export"]);

/**
 * Assigns a book to exactly one shelf by first-match precedence:
 * Archived > Completed > Waiting for Feedback > Currently Writing.
 */
export function assignShelf(
  book: Pick<ShelfBookInput, "status" | "archivedAt" | "pendingFindings">,
): Shelf {
  if (book.archivedAt != null) return "archived";
  if (COMPLETED_STATUSES.has(book.status)) return "completed";
  if (book.pendingFindings > 0 || book.status === "beta") return "waiting";
  return "currentlyWriting";
}
