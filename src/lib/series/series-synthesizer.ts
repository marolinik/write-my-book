import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

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

  // Read or create the series-level document
  const seriesDoc = await seriesDocService.findByType(mapping.series);
  let seriesContent: string;

  const sectionHeader = `## Book ${String(bookNumber).padStart(2, "0")} Contributions`;
  const bookContribution = `${sectionHeader}\n\n${bookContent.content}`;

  if (seriesDoc) {
    const existing = await seriesDocService.read(seriesDoc.id);
    seriesContent = existing?.content ?? "";

    // Find and replace existing section, or append
    const sectionRegex = new RegExp(
      `## Book ${String(bookNumber).padStart(2, "0")} Contributions[\\s\\S]*?(?=\\n## Book \\d|$)`
    );

    if (sectionRegex.test(seriesContent)) {
      seriesContent = seriesContent.replace(sectionRegex, bookContribution);
    } else {
      seriesContent = seriesContent.trimEnd() + "\n\n" + bookContribution;
    }

    await seriesDocService.update(
      seriesDoc.id,
      seriesContent,
      undefined,
      "agent_write",
      "series_synthesis"
    );
  } else {
    // Create new series document with this book's contribution
    seriesContent = `# Series ${artifactType.replace(/_/g, " ")}\n\n${bookContribution}`;

    await seriesDocService.create(
      mapping.series,
      seriesContent,
      `Series ${artifactType.replace(/_/g, " ")}`,
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
