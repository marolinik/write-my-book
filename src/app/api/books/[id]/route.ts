import { NextRequest, NextResponse } from "next/server";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateBookSchema } from "@/lib/validation";
import { deleteBookChunks } from "@/lib/vector";
import { getBookStorage } from "@/lib/storage";
import { purgeStorage } from "@/lib/storage/purge";
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
    // P7-S12: a rename onto another of the writer's book names trips
    // @@unique([userId, name]) as P2002 — a conflict, not a server fault. Same
    // 409 and message as POST /api/books.
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "A book with this name already exists" },
        { status: 409 }
      );
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

    // Clean up vector memory (fire-and-forget)
    deleteBookChunks(id).catch(() => {});

    // P7-S20: a book-scoped writer rule belongs to its book. The relation was
    // onDelete SetNull, and a null bookId MEANS "global preference", so a
    // deleted book's rules went on steering every other book's agents. They
    // go with the book, in the same transaction.
    await db.$transaction([
      db.writerMemory.deleteMany({ where: { bookId: id } }),
      db.book.delete({ where: { id } }),
    ]);

    // P7-S20: every stored object of the book (manuscript, document versions,
    // front and back cover) lives under its userId/bookId prefix; UDG round-6
    // removed only the front cover. Purged after the rows are gone so a failed
    // delete never costs a live book its files.
    await purgeBookStorage(user.id, id);

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

/**
 * Best-effort: the book is already deleted, so a storage fault is logged for
 * the operator and never turned into an error for the writer.
 */
async function purgeBookStorage(userId: string, bookId: string): Promise<void> {
  try {
    const { failed } = await purgeStorage(getBookStorage(userId, bookId));
    if (failed > 0) {
      console.error(
        `DELETE /api/books/:id: ${failed} stored object(s) of book ${bookId} could not be removed`
      );
    }
  } catch (error) {
    console.error(`DELETE /api/books/:id: storage cleanup of book ${bookId} failed:`, error);
  }
}
