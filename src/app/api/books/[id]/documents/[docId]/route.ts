import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateDocumentSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

/** GET /api/books/:id/documents/:docId — get a document with content. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, docId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const svc = new DocumentService(user.id, bookId);
    const result = await svc.read(docId);

    if (!result) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/documents/:docId error:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

/** PATCH /api/books/:id/documents/:docId — update document content. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, docId } = await params;
    const body = await req.json();
    const data = updateDocumentSchema.parse(body);

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const doc = await db.document.findFirst({
      where: { id: docId, bookId },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, bookId);
    const result = await svc.update(
      docId,
      data.content,
      data.title,
      data.changeType,
      data.changeSource
    );

    return NextResponse.json(result);
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
    console.error("PATCH /api/books/:id/documents/:docId error:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

/** DELETE /api/books/:id/documents/:docId — delete a document. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, docId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const doc = await db.document.findFirst({
      where: { id: docId, bookId },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, bookId);
    await svc.delete(docId);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/books/:id/documents/:docId error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
