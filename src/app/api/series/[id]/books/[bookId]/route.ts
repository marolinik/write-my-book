import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string; bookId: string }> };

/** DELETE /api/series/:id/books/:bookId — detach a book from the series. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId, bookId } = await params;

    // Verify series ownership
    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // Verify book belongs to this series
    const book = await db.book.findFirst({
      where: { id: bookId, seriesId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json(
        { error: "Book not found in this series" },
        { status: 404 }
      );
    }

    // Detach: set seriesId=null, bookNumber=1
    await db.book.update({
      where: { id: bookId },
      data: { seriesId: null, bookNumber: 1 },
    });

    return NextResponse.json({ detached: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/series/:id/books/:bookId error:", error);
    return NextResponse.json(
      { error: "Failed to detach book from series" },
      { status: 500 }
    );
  }
}
