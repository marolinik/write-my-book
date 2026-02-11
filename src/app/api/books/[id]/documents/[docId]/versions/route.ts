import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

/** GET /api/books/:id/documents/:docId/versions — list versions. */
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
    const versions = await svc.getVersions(docId);

    return NextResponse.json(versions);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "GET /api/books/:id/documents/:docId/versions error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to list versions" },
      { status: 500 }
    );
  }
}
