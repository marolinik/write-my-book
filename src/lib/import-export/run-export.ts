import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";
import { exportManuscript, exportSeriesOmnibus } from "@/lib/import-export/export-pipeline";

export interface ExportRequest {
  format: "docx" | "pdf" | "epub";
  isDraft?: boolean;
  sceneBreakGlyph?: string;
  template?: string;
}

export type ExportResult = Awaited<ReturnType<typeof exportManuscript>>;

/**
 * Wave 7 / D22: one book's export, as the export worker runs it (the route
 * only enqueues). Ownership is checked again here: the job carries ids, and a
 * book that changed hands or was deleted since the request is refused.
 */
export async function runBookExport(userId: string, bookId: string, request: ExportRequest): Promise<ExportResult> {
  const book = await db.book.findFirst({ where: { id: bookId, userId } });
  if (!book) throw new Error("Book not found for export");

  // Real chapter titles live in the DB, not the manuscript markdown — thread
  // them into the pipeline so headings/TOC/EPUB titles are correct (F9/F10).
  const chapters = await db.chapter.findMany({
    where: { bookId },
    select: { chapterNumber: true, title: true },
  });
  const chapterTitles = new Map<number, string>();
  for (const ch of chapters) {
    if (ch.title) chapterTitles.set(ch.chapterNumber, ch.title);
  }

  return exportManuscript(
    {
      bookId,
      userId,
      format: request.format,
      isDraft: request.isDraft,
      sceneBreakGlyph: request.sceneBreakGlyph,
      template: request.template,
      chapterTitles,
      // UDG round-8: the uploaded covers bind into the export (front + back).
      coverUrl: book.coverUrl,
      backCoverUrl: book.backCoverUrl,
    },
    getBookStorage(userId, bookId),
    book.name,
    book.language
  );
}

/** One series omnibus, as the export worker runs it. */
export async function runSeriesExport(userId: string, seriesId: string, request: ExportRequest): Promise<ExportResult> {
  const series = await db.series.findFirst({ where: { id: seriesId, userId } });
  if (!series) throw new Error("Series not found for export");
  return exportSeriesOmnibus({
    userId,
    seriesId,
    format: request.format,
    isDraft: request.isDraft,
    sceneBreakGlyph: request.sceneBreakGlyph,
    template: request.template,
  });
}
