import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import {
  composeSeriesDocument,
  upsertBookSection,
  type MissingBook,
} from "./compose-series-document";

/**
 * Map book-level artifact types to their series-level counterparts.
 */
const ARTIFACT_MAP: Record<string, { book: DocumentType; series: DocumentType }> = {
  STORY_BIBLE: {
    book: DocumentType.STORY_BIBLE,
    series: DocumentType.SERIES_BIBLE,
  },
  ARCHITECTURE: {
    book: DocumentType.ARCHITECTURE,
    series: DocumentType.SERIES_ARCHITECTURE,
  },
  FINGERPRINT: {
    book: DocumentType.FINGERPRINT,
    series: DocumentType.SERIES_FINGERPRINT,
  },
};

export interface BookContribution {
  bookId: string;
  bookName: string;
  bookNumber: number;
  hasArtifact: boolean;
}

/**
 * Synthesize a book's artifact into the series-level document.
 * Finds or creates a `## Book NN Contributions` section in the series doc
 * and replaces/appends the book's content there.
 */
export async function synthesizeToSeries(
  userId: string,
  seriesId: string,
  bookId: string,
  bookNumber: number,
  artifactType: string
): Promise<boolean> {
  const mapping = ARTIFACT_MAP[artifactType];
  if (!mapping) return false;

  const bookDocService = new DocumentService(userId, bookId);
  const seriesDocService = new DocumentService(userId, undefined, seriesId);

  // Read the book-level artifact
  const bookDoc = await bookDocService.findByType(mapping.book);
  if (!bookDoc) return false;

  const bookContent = await bookDocService.read(bookDoc.id);
  if (!bookContent || !bookContent.content) return false;

  // O2: a series document is a composition, not a paste. The book's own
  // headings are demoted under its section, the section lands in book order,
  // and a book that has contributed nothing is named instead of leaving a
  // silent gap (the owner's series opened at Book 02 for exactly that reason).
  const book = await db.book.findFirst({
    where: { id: bookId },
    select: { name: true, language: true },
  });

  const siblings = await db.book.findMany({
    where: { seriesId, userId },
    orderBy: { bookNumber: "asc" },
    select: { id: true, name: true, bookNumber: true },
  });

  const missing: MissingBook[] = [];
  for (const sibling of siblings) {
    if (sibling.id === bookId) continue;
    const siblingDocs = new DocumentService(userId, sibling.id);
    const has = await siblingDocs.findByType(mapping.book);
    if (!has) {
      missing.push({ bookNumber: sibling.bookNumber, bookName: sibling.name });
    }
  }

  const section = {
    bookNumber,
    bookName: book?.name ?? `Book ${bookNumber}`,
    content: bookContent.content,
    language: book?.language ?? undefined,
  };
  const seriesTitle = `Series ${artifactType.replace(/_/g, " ").toLowerCase()}`;

  // The series language is the first book's — the yardstick a mixed-language
  // section is measured against, not a rule imposed on it.
  const seriesLanguage = siblings.length
    ? (
        await db.book.findFirst({
          where: { id: siblings[0].id },
          select: { language: true },
        })
      )?.language ?? undefined
    : book?.language ?? undefined;

  const seriesDoc = await seriesDocService.findByType(mapping.series);

  if (seriesDoc) {
    const existing = await seriesDocService.read(seriesDoc.id);
    const updated = upsertBookSection(
      existing?.content ?? `# ${seriesTitle}`,
      section,
      seriesLanguage
    );
    await seriesDocService.update(
      seriesDoc.id,
      updated,
      undefined,
      "agent_write",
      "series_synthesis"
    );
  } else {
    const created = composeSeriesDocument({
      title: seriesTitle,
      sections: [section],
      seriesLanguage,
      missingBooks: missing,
    });
    await seriesDocService.create(
      mapping.series,
      created,
      seriesTitle,
      undefined,
      undefined,
      "series_synthesis"
    );
  }

  return true;
}

/**
 * List which books in a series have contributed to a given artifact type.
 */
export async function listBookContributions(
  userId: string,
  seriesId: string,
  artifactType: string
): Promise<BookContribution[]> {
  const mapping = ARTIFACT_MAP[artifactType];
  if (!mapping) return [];

  const books = await db.book.findMany({
    where: { seriesId, userId },
    orderBy: { bookNumber: "asc" },
    select: { id: true, name: true, bookNumber: true },
  });

  const results: BookContribution[] = [];

  for (const book of books) {
    const docService = new DocumentService(userId, book.id);
    const doc = await docService.findByType(mapping.book);
    results.push({
      bookId: book.id,
      bookName: book.name,
      bookNumber: book.bookNumber,
      hasArtifact: !!doc,
    });
  }

  return results;
}
