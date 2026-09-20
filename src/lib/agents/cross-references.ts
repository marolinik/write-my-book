/**
 * A-44 — the other half of a continuity finding.
 *
 * The continuity checker's prompt has always required `crossReferences`: the
 * passage that CONFLICTS with the one it quotes. The tool accepted the array
 * and then dropped it on the floor — it is not a column, nothing reads it, and
 * nothing ever verified it. So a conflict arrived as one quote plus a sentence
 * asserting that another passage says something else, and the writer had to go
 * find it.
 *
 * It was also single-book by construction: a cross-reference had a chapter
 * number and no book, while the O9 tools (`ListSeriesBooks`,
 * `ReadSiblingChapter`) exist precisely so the checker can reason across the
 * series. A conflict between book 1 and book 3 could not be expressed at all.
 *
 * This module verifies each cited passage against the text it claims to come
 * from — this book's chapter, or a sibling book's — and renders the survivors
 * into the finding's rationale, which IS persisted and IS shown. A citation
 * that cannot be found is dropped rather than persisted: an invented
 * conflicting passage is worse than none, because the writer would go looking
 * for it.
 */

import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

export interface CrossReferenceInput {
  chapterNumber: number;
  paragraphNumber: number;
  quote: string;
  /** A sibling book's number in this series. Omit for the current book. */
  bookNumber?: number;
}

export interface CrossReferenceResult {
  /** The citations whose quote was found in the text it points at. */
  verified: Array<CrossReferenceInput & { bookName?: string }>;
  /** Citations that pointed at text that does not say that. */
  rejected: Array<{ reference: CrossReferenceInput; reason: string }>;
}

/** How closely a cited quote must match the text it claims to come from. */
const MIN_SIMILARITY = 0.8;

/** Everything this module needs from the caller, kept db-free for testing. */
export interface CrossReferenceContext {
  bookId: string;
  userId: string;
  seriesId?: string;
  /** Reads a chapter's prose. Injected so the verification is testable. */
  readChapter: (
    chapterNumber: number,
    bookNumber?: number
  ) => Promise<{ content: string; bookName?: string } | null>;
}

/** The production reader: this book's chapters, or a sibling book's. */
export function makeChapterReader(ctx: {
  bookId: string;
  userId: string;
  seriesId?: string;
}): CrossReferenceContext["readChapter"] {
  return async (chapterNumber: number, bookNumber?: number) => {
    let bookId = ctx.bookId;
    let bookName: string | undefined;

    if (bookNumber !== undefined) {
      if (!ctx.seriesId) return null;
      const sibling = await db.book.findFirst({
        where: { seriesId: ctx.seriesId, userId: ctx.userId, bookNumber },
        select: { id: true, name: true },
      });
      if (!sibling) return null;
      bookId = sibling.id;
      bookName = sibling.name;
    }

    const docs = new DocumentService(ctx.userId, bookId);
    const doc = await docs.findByType(DocumentType.CHAPTER_CONTENT, chapterNumber);
    if (!doc) return null;
    const read = await docs.read(doc.id);
    const content = read?.content?.trim() ?? "";
    if (content.length === 0) return null;
    return { content, bookName };
  };
}

/**
 * Verify each cited passage against the text it claims to come from.
 *
 * `similarity` is the same fuzzy matcher the anchorQuote uses, passed in so
 * this module does not duplicate it.
 */
export async function verifyCrossReferences(
  references: CrossReferenceInput[] | undefined,
  context: CrossReferenceContext,
  similarity: (needle: string, haystack: string) => number
): Promise<CrossReferenceResult> {
  const result: CrossReferenceResult = { verified: [], rejected: [] };
  if (!references || references.length === 0) return result;

  for (const reference of references) {
    if (typeof reference?.quote !== "string" || reference.quote.trim().length === 0) {
      result.rejected.push({ reference, reason: "no quote" });
      continue;
    }

    const where =
      reference.bookNumber !== undefined
        ? `book ${reference.bookNumber}, chapter ${reference.chapterNumber}`
        : `chapter ${reference.chapterNumber}`;

    const source = await context.readChapter(reference.chapterNumber, reference.bookNumber);
    if (!source) {
      result.rejected.push({ reference, reason: `${where} has no text to cite` });
      continue;
    }

    if (similarity(reference.quote, source.content) < MIN_SIMILARITY) {
      result.rejected.push({
        reference,
        reason: `the quoted passage is not in ${where}`,
      });
      continue;
    }

    result.verified.push({ ...reference, bookName: source.bookName });
  }

  return result;
}

/** One line per verified citation, for the writer to follow. */
export function formatCrossReferences(
  verified: CrossReferenceResult["verified"]
): string {
  if (verified.length === 0) return "";
  const lines = verified.map((reference) => {
    const book =
      reference.bookNumber !== undefined
        ? `${reference.bookName ?? `Book ${reference.bookNumber}`}, `
        : "";
    return `- ${book}ch. ${reference.chapterNumber}, ¶${reference.paragraphNumber}: "${reference.quote.trim()}"`;
  });
  return lines.join("\n");
}
