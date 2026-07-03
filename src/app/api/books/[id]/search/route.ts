import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { searchQuerySchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { findInText, type Snippet } from "@/lib/search/find-replace";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

interface SearchHit {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  count: number;
  snippets: Snippet[];
}

/**
 * GET /api/books/:id/search?q=&caseSensitive=0|1 — plain-text search across
 * every chapter's CHAPTER_CONTENT. Case-insensitive by default; q is 2..200
 * chars. Returns per-chapter hit counts + up to 3 context snippets each.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const url = new URL(request.url);
    const parsed = searchQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      caseSensitive: url.searchParams.get("caseSensitive"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { q, caseSensitive } = parsed.data;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const chapters = await db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
      select: { id: true, chapterNumber: true, title: true },
    });

    const svc = new DocumentService(user.id, bookId);
    const hits: SearchHit[] = [];
    let totalCount = 0;

    for (const chapter of chapters) {
      const doc = await svc.findByType(
        DocumentType.CHAPTER_CONTENT,
        chapter.chapterNumber
      );
      if (!doc) continue;

      const content = (await svc.readPinned(doc.id))?.content ?? "";
      const { count, snippets } = findInText(content, q, caseSensitive);
      if (count === 0) continue;

      totalCount += count;
      hits.push({
        chapterId: chapter.id,
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        count,
        snippets,
      });
    }

    return NextResponse.json({ hits, totalCount });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
