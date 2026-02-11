import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/series/:id/analytics — per-book stats and cross-book totals. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;

    // Verify series ownership
    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // Get all books with chapter stats
    const books = await db.book.findMany({
      where: { seriesId },
      orderBy: { bookNumber: "asc" },
      include: {
        chapters: {
          select: {
            chapterNumber: true,
            status: true,
            wordCount: true,
          },
        },
        _count: {
          select: { chapters: true, documents: true },
        },
      },
    });

    const bookStats = books.map((book) => {
      const statusCounts: Record<string, number> = {};
      for (const ch of book.chapters) {
        statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
      }

      return {
        bookId: book.id,
        bookNumber: book.bookNumber,
        name: book.name,
        status: book.status,
        wordCount: book.wordCount,
        chapterCount: book._count.chapters,
        documentCount: book._count.documents,
        chapterStatusCounts: statusCounts,
      };
    });

    const totals = {
      totalBooks: books.length,
      totalWordCount: books.reduce((sum, b) => sum + b.wordCount, 0),
      totalChapters: books.reduce((sum, b) => sum + b._count.chapters, 0),
      totalDocuments: books.reduce((sum, b) => sum + b._count.documents, 0),
    };

    return NextResponse.json({ books: bookStats, totals });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series/:id/analytics error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
