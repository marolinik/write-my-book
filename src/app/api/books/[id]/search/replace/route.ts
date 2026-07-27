import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { replaceRequestSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { replaceInText } from "@/lib/search/find-replace";
import { countWords } from "@/lib/utils";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

interface ReplacedChapter {
  chapterId: string;
  count: number;
  newVersion: number;
}

/**
 * POST /api/books/:id/search/replace — replace all plain-text occurrences of
 * `find` with `replace` across the targeted chapters (absent chapterIds = the
 * whole book). Each changed chapter is saved through DocumentService.update
 * (changeType 'find_replace') so a version is minted, and chapter/book word
 * counts are kept in sync. Chapters with zero matches are left untouched (no
 * version churn). Sequential — a book has few chapters.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const body = await parseJsonBody(request);
    const parsed = replaceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { find, replace, chapterIds, caseSensitive, wholeWord } = parsed.data;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Ownership is fenced by bookId; chapterIds only narrows within the book.
    const chapters = await db.chapter.findMany({
      where: {
        bookId,
        ...(chapterIds ? { id: { in: chapterIds } } : {}),
      },
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true, wordCount: true },
    });

    const svc = new DocumentService(user.id, bookId);
    const replaced: ReplacedChapter[] = [];
    let totalReplacements = 0;
    let bookWordDelta = 0;

    for (const chapter of chapters) {
      const doc = await svc.findByType(
        DocumentType.CHAPTER_CONTENT,
        chapter.chapterNumber
      );
      if (!doc) continue;

      const content = (await svc.readPinned(doc.id))?.content ?? "";
      const { count, result } = replaceInText(
        content,
        find,
        replace,
        caseSensitive,
        // D-189: whole-word matching, so a book-wide character rename can no
        // longer rewrite `same`/`sample`/`samovar` and report it as success.
        wholeWord
      );
      if (count === 0) continue;

      const updated = await svc.update(
        doc.id,
        result,
        undefined,
        "find_replace",
        "user"
      );

      const newWordCount = countWords(result);
      const wordDelta = newWordCount - chapter.wordCount;
      bookWordDelta += wordDelta;

      await db.chapter.update({
        where: { id: chapter.id },
        data: { wordCount: newWordCount },
      });

      totalReplacements += count;
      replaced.push({
        chapterId: chapter.id,
        count,
        newVersion: updated.version.version,
      });
    }

    if (bookWordDelta !== 0) {
      await db.book.update({
        where: { id: bookId },
        data: { wordCount: { increment: bookWordDelta } },
      });
    }

    return NextResponse.json({ replaced, totalReplacements });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/books/:id/search/replace error:", error);
    return NextResponse.json({ error: "Replace failed" }, { status: 500 });
  }
}
