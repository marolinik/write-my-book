import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocumentSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents";
import type { DocumentType } from "@/generated/prisma/enums";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/documents — list documents for a book. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const svc = new DocumentService(user.id, bookId);
    const documents = await svc.list();

    return NextResponse.json(documents);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/documents error:", error);
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    );
  }
}

/** POST /api/books/:id/documents — create a document. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(req);
    const data = createDocumentSchema.parse(body);

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const svc = new DocumentService(user.id, bookId);
    const document = await svc.create(
      data.type as DocumentType,
      data.content,
      data.title,
      data.chapterNumber,
      data.actNumber,
      data.changeSource
    );

    // Update Chapter.wordCount when CHAPTER_CONTENT is created via API
    if (data.type === "CHAPTER_CONTENT" && data.chapterNumber && data.content) {
      const wordCount = data.content
        .replace(/```[\s\S]*?```/g, "")
        .replace(/[#*_~`>|-]/g, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      await db.chapter.updateMany({
        where: { bookId, chapterNumber: data.chapterNumber },
        data: { wordCount },
      });
    }

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    // D-16: the new @@unique([bookId, type, chapterNumber]) makes a duplicate
    // chapter-scoped document a P2002 on the single create() above — no race
    // needed. Return 409 (not a hard 500): a create endpoint must NOT converge
    // into a blind last-write-wins update, which would reintroduce the silent
    // lost-update this constraint exists to prevent. Callers refetch the
    // existing row and PUT with a version stamp instead.
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "A document of this type already exists for this chapter" },
        { status: 409 }
      );
    }
    console.error("POST /api/books/:id/documents error:", error);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}
