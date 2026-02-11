import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { editHistoryQuerySchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/editorial/history — Chronological EditAction log. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const query = editHistoryQuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );

    const where: Record<string, unknown> = { bookId };
    if (query.chapterNumber !== undefined)
      where.chapterNumber = query.chapterNumber;

    const [actions, total] = await Promise.all([
      db.editAction.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      db.editAction.count({ where }),
    ]);

    return NextResponse.json({ actions, total });
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
    console.error("GET /api/books/:id/editorial/history error:", error);
    return NextResponse.json(
      { error: "Failed to list edit history" },
      { status: 500 }
    );
  }
}
