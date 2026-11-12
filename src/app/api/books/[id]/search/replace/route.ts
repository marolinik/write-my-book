import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { replaceRequestSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { replaceInText } from "@/lib/search/find-replace";
import { countWords } from "@/lib/utils";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { reconcileBookCounters } from "@/lib/books/book-counters";

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

    // P2-13: each chapter is its own versioned save, so a failure on chapter k
    // leaves 1..k-1 replaced. The writer is told which, and the book's word
    // total is recomputed from the chapter rows whether the run finished or not
    // (no delta increment that a failure could skip).
    try {
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
      // Finding B audit: a book-wide find/replace is the writer's own explicit,
      // immediate read-modify-write of each target chapter (readPinned → replace
      // → save in one pass), so it is single-writer-safe by construction and
      // deliberately omits expectedVersion. A truly concurrent interactive save
      // of the SAME chapter inside this window could last-write-wins — accepted
      // here as out of scope (the per-chapter read+write is effectively atomic
      // for the same user; cross-user/agent races are guarded elsewhere).

      const newWordCount = countWords(result);

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

    } catch (error) {
      console.error("POST /api/books/:id/search/replace failed mid-run:", error);
      return NextResponse.json(
        { error: "Replace failed", code: "SERVER_ERROR", partial: true, replaced, totalReplacements },
        { status: 500 }
      );
    } finally {
      await reconcileBookCounters(bookId).catch((error) =>
        console.error("POST /api/books/:id/search/replace: counter reconcile failed:", error)
      );
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
