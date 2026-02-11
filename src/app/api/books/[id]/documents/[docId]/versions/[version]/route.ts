import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents";

type RouteParams = {
  params: Promise<{ id: string; docId: string; version: string }>;
};

/** GET /api/books/:id/documents/:docId/versions/:version — get version content. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, docId, version: versionStr } = await params;
    const version = parseInt(versionStr, 10);

    if (isNaN(version) || version < 1) {
      return NextResponse.json(
        { error: "Invalid version number" },
        { status: 400 }
      );
    }

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
    const content = await svc.getVersionContent(docId, version);

    if (content === null) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ version, content });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "GET /api/books/:id/documents/:docId/versions/:version error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch version" },
      { status: 500 }
    );
  }
}
