import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addBookToSeriesSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/series/:id/books — add an existing or new book to the series. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const body = await req.json();
    const data = addBookToSeriesSchema.parse(body);

    // Verify series ownership
    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // Get next book number
    const lastBook = await db.book.findFirst({
      where: { seriesId },
      orderBy: { bookNumber: "desc" },
      select: { bookNumber: true },
    });
    const nextNumber = (lastBook?.bookNumber ?? 0) + 1;

    let book;

    if (data.bookId) {
      // Link existing book to the series
      const existing = await db.book.findFirst({
        where: { id: data.bookId, userId: user.id },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Book not found" },
          { status: 404 }
        );
      }
      if (existing.seriesId) {
        return NextResponse.json(
          { error: "Book is already in a series" },
          { status: 400 }
        );
      }

      book = await db.book.update({
        where: { id: data.bookId },
        data: {
          seriesId,
          bookNumber: nextNumber,
        },
      });
    } else {
      // Create a new book in the series
      book = await db.book.create({
        data: {
          userId: user.id,
          seriesId,
          name: data.name!,
          genre: data.genre ?? series.genre ?? null,
          language: data.language ?? series.language,
          bookNumber: nextNumber,
        },
      });
    }

    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error("POST /api/series/:id/books error:", error);
    return NextResponse.json(
      { error: "Failed to add book to series" },
      { status: 500 }
    );
  }
}
