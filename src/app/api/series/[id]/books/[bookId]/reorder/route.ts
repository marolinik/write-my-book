import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reorderBookSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string; bookId: string }> };

/**
 * Where books wait mid-reorder. Book numbers are validated to 1..99, so this is
 * clear of every real one.
 */
const BOOK_NUMBER_PARK = 10_000;

/** POST /api/series/:id/books/:bookId/reorder — reorder a book within the series. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId, bookId } = await params;
    const body = await parseJsonBody(req);
    const { newBookNumber } = reorderBookSchema.parse(body);

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

    const oldNumber = book.bookNumber;
    if (oldNumber === newBookNumber) {
      return NextResponse.json({ reordered: true });
    }

    // Two phases in one transaction. (series_id, book_number) is a plain
    // unique index, checked row by row: shifting the neighbours while the
    // moving book still held its old number put the first of them on top of
    // it, and every adjacent move answered 500 (P3-S08). So every book the
    // move touches — the moving one included — is parked far above the series
    // first, and only then given its final number.
    const movingDown = newBookNumber > oldNumber;
    const low = Math.min(oldNumber, newBookNumber);
    const high = Math.max(oldNumber, newBookNumber);

    await db.$transaction(async (tx) => {
      // Phase A — park the whole range.
      await tx.book.updateMany({
        where: { seriesId, bookNumber: { gte: low, lte: high } },
        data: { bookNumber: { increment: BOOK_NUMBER_PARK } },
      });

      // Phase B — the others shift one place toward the gap the moving book
      // left (down one when it moves down the list, up one when it moves up)...
      await tx.book.updateMany({
        where: {
          seriesId,
          id: { not: bookId },
          bookNumber: { gte: low + BOOK_NUMBER_PARK, lte: high + BOOK_NUMBER_PARK },
        },
        data: {
          bookNumber: {
            decrement: movingDown ? BOOK_NUMBER_PARK + 1 : BOOK_NUMBER_PARK - 1,
          },
        },
      });

      // ...and the moving book takes the number they vacated.
      await tx.book.update({
        where: { id: bookId },
        data: { bookNumber: newBookNumber },
      });
    });

    return NextResponse.json({ reordered: true });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("POST /api/series/:id/books/:bookId/reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder book" },
      { status: 500 }
    );
  }
}
