import { NextRequest, NextResponse } from "next/server";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateBookSchema } from "@/lib/validation";
import { deleteBookChunks } from "@/lib/vector";
import { getBookStorage } from "@/lib/storage";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

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
    const body = await parseJsonBody(req);
    const data = updateBookSchema.parse(body);

    const existing = await db.book.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Single-pin semantics: pinning one book clears any other pinned book for
    // this user (Milica/Viktor — the dashboard nudge follows one chosen book).
    if (data.pinned === true) {
      await db.book.updateMany({
        where: { userId: user.id, pinned: true, id: { not: id } },
        data: { pinned: false },
      });
    }

    const book = await db.book.update({
      where: { id },
      data,
    });

    return NextResponse.json(book);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
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

    // Clean up vector memory (fire-and-forget)
    deleteBookChunks(id).catch(() => {});

    // UDG round-6 (Igor): remove the uploaded cover object too so deleting a book never leaves orphans in S3.
    if (existing.coverUrl) {
      getBookStorage(user.id, id)
        .delete(existing.coverUrl)
        .catch(() => {});
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
