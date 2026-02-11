import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateBookSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id — get a single book with related data. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const book = await db.book.findFirst({
      where: { id, userId: user.id },
      include: {
        series: true,
        settings: true,
        chapters: { orderBy: { chapterNumber: "asc" } },
        _count: { select: { documents: true, agentSessions: true } },
      },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    return NextResponse.json(book);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id error:", error);
    return NextResponse.json(
      { error: "Failed to fetch book" },
      { status: 500 }
    );
  }
}

/** PATCH /api/books/:id — update a book. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json();
    const data = updateBookSchema.parse(body);

    const existing = await db.book.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const book = await db.book.update({
      where: { id },
      data,
    });

    return NextResponse.json(book);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: error }, { status: 400 });
    }
    console.error("PATCH /api/books/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update book" },
      { status: 500 }
    );
  }
}

/** DELETE /api/books/:id — delete a book and all related data. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await db.book.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    await db.book.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/books/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete book" },
      { status: 500 }
    );
  }
}
