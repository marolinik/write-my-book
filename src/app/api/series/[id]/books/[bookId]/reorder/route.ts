import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reorderBookSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string; bookId: string }> };

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

    // Reorder in a transaction: shift other books, then set this one
    await db.$transaction(async (tx) => {
      if (newBookNumber > oldNumber) {
        // Moving down: shift books between old+1..new up by -1
        await tx.book.updateMany({
          where: {
            seriesId,
            bookNumber: { gt: oldNumber, lte: newBookNumber },
          },
          data: { bookNumber: { decrement: 1 } },
        });
      } else {
        // Moving up: shift books between new..old-1 down by +1
        await tx.book.updateMany({
          where: {
            seriesId,
            bookNumber: { gte: newBookNumber, lt: oldNumber },
          },
          data: { bookNumber: { increment: 1 } },
        });
      }

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
