import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

export type InheritanceStatus = "own" | "inherited" | "missing";

export interface InheritanceState {
  seriesDocType: DocumentType;
  bookDocType: DocumentType;
  label: string;
  status: InheritanceStatus;
  seriesVersion: number | null;
  bookVersion: number | null;
}

/**
 * Document type pairs: series-level -> book-level.
 */
const INHERITANCE_PAIRS: Array<{
  series: DocumentType;
  book: DocumentType;
  label: string;
}> = [
  {
    series: DocumentType.SERIES_BIBLE,
    book: DocumentType.STORY_BIBLE,
    label: "Story Bible",
  },
  {
    series: DocumentType.SERIES_ARCHITECTURE,
    book: DocumentType.ARCHITECTURE,
    label: "Architecture",
  },
  {
    series: DocumentType.SERIES_FINGERPRINT,
    book: DocumentType.FINGERPRINT,
    label: "Fingerprint",
  },
];

/**
 * Check the inheritance state for each series→book document pair.
 * Returns whether the book has its own version, is inheriting from series, or is missing.
 */
export async function checkInheritanceState(
  userId: string,
  seriesId: string,
  bookId: string
): Promise<InheritanceState[]> {
  const seriesDocService = new DocumentService(userId, undefined, seriesId);
  const bookDocService = new DocumentService(userId, bookId);

  const results: InheritanceState[] = [];

  for (const pair of INHERITANCE_PAIRS) {
    const seriesDoc = await seriesDocService.findByType(pair.series);
    const bookDoc = await bookDocService.findByType(pair.book);

    let status: InheritanceStatus;
    if (bookDoc) {
      status = "own";
    } else if (seriesDoc) {
      // Series doc exists but book doesn't have it — can inherit
      status = "missing";
    } else {
      status = "missing";
    }

    results.push({
      seriesDocType: pair.series,
      bookDocType: pair.book,
      label: pair.label,
      status,
      seriesVersion: seriesDoc?.currentVersion ?? null,
      bookVersion: bookDoc?.currentVersion ?? null,
    });
  }

  return results;
}

/**
 * Apply inheritance: copy series documents to a book.
 * Only copies if the book doesn't already have its own version.
 */
export async function applyInheritance(
  userId: string,
  seriesId: string,
  bookId: string,
  documentTypes?: DocumentType[]
): Promise<{
  applied: string[];
  skipped: string[];
  /** Why each skipped pair did not copy (H3 — a bare 200 with all-skipped read as success but silently did nothing). */
  skippedReasons: Record<string, string>;
  /** Human summary when nothing was applied. */
  note?: string;
}> {
  const seriesDocService = new DocumentService(userId, undefined, seriesId);
  const bookDocService = new DocumentService(userId, bookId);

  const applied: string[] = [];
  const skipped: string[] = [];
  const skippedReasons: Record<string, string> = {};

  const pairs = documentTypes
    ? INHERITANCE_PAIRS.filter((p) => documentTypes.includes(p.series))
    : INHERITANCE_PAIRS;

  for (const pair of pairs) {
    // Check if book already has its own version
    const bookDoc = await bookDocService.findByType(pair.book);
    if (bookDoc) {
      skipped.push(pair.label);
      skippedReasons[pair.label] = "book already has its own version";
      continue;
    }

    // Read from series
    const seriesDoc = await seriesDocService.findByType(pair.series);
    if (!seriesDoc) {
      skipped.push(pair.label);
      skippedReasons[pair.label] = "no series-level document exists to inherit (run the series setup first)";
      continue;
    }

    const seriesContent = await seriesDocService.read(seriesDoc.id);
    if (!seriesContent || !seriesContent.content) {
      skipped.push(pair.label);
      skippedReasons[pair.label] = "series document content could not be read";
      continue;
    }

    // Write to book
    await bookDocService.create(
      pair.book,
      seriesContent.content,
      seriesDoc.title ?? undefined,
      undefined,
      undefined,
      "series_inheritance"
    );

    applied.push(pair.label);
  }

  const note =
    applied.length === 0 && skipped.length > 0
      ? `Nothing was inherited. ${Object.entries(skippedReasons)
          .map(([label, reason]) => `${label}: ${reason}`)
          .join("; ")}.`
      : undefined;
  return { applied, skipped, skippedReasons, ...(note ? { note } : {}) };
}
