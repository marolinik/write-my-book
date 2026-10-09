import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocumentType } from "@/generated/prisma/enums";
import { DocumentService } from "@/lib/documents/document-service";
import { getAnalysisReport } from "@/lib/reports/analysis-report";
import { computeBookShape } from "@/lib/structure/book-shape";

/**
 * GET /api/books/:id/structure/book-map — dev editor v2, phase C.
 *
 * The book's shape for the writer's book map: per chapter its length against
 * the median, scenes, dialogue share, where it starts in the book, tension from
 * the analysis, and the developmental editor's hook ratings. Numbers only; the
 * chapter text never leaves the server here.
 */

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id }, select: { id: true } });
    if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

    const chapters = await db.chapter.findMany({
      where: { bookId },
      select: { id: true, chapterNumber: true, title: true },
      orderBy: { chapterNumber: "asc" },
    });
    const docs = new DocumentService(user.id, bookId);
    const withText = await Promise.all(
      chapters.map(async (c) => {
        const doc = await docs.findByType(DocumentType.CHAPTER_CONTENT, c.chapterNumber);
        const read = doc ? await docs.read(doc.id) : null;
        return { ...c, content: read?.content ?? "" };
      })
    );

    const [report, ratings] = await Promise.all([
      getAnalysisReport(user.id, bookId).catch(() => null),
      db.chapterHookRating.findMany({
        where: { bookId },
        select: { chapterId: true, opening: true, ending: true, note: true },
      }),
    ]);
    const tension = new Map<number, number>(
      (report?.pacing ?? []).map((p: { chapter: number; tension: number }) => [p.chapter, p.tension])
    );
    const hookById = new Map(ratings.map((r) => [r.chapterId, r]));

    const shape = computeBookShape(withText);
    return NextResponse.json({
      totalWords: shape.totalWords,
      medianWords: shape.medianWords,
      chapters: shape.chapters.map(({ opening: _o, closing: _c, ...c }) => {
        const hook = hookById.get(c.chapterId);
        return {
          ...c,
          tension: tension.get(c.chapterNumber) ?? null,
          hook: hook ? { opening: hook.opening, ending: hook.ending, note: hook.note } : null,
        };
      }),
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/structure/book-map error:", error);
    return NextResponse.json({ error: "Failed to load the book map" }, { status: 500 });
  }
}
