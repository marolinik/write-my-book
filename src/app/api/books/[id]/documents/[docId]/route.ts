import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateDocumentSchema } from "@/lib/validation";
import { DocumentService, VersionConflictError } from "@/lib/documents";
import { onDocumentChanged } from "@/lib/vector/memory-manager";
import { deleteDocumentChunks } from "@/lib/vector";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

/** Map Prisma DocumentType to vector docType for cleanup. */
function mapDocType(prismaType: string): string {
  switch (prismaType) {
    case "CHAPTER_CONTENT":
    case "CHAPTER_BRIEF":
    case "CHAPTER_PLAN":
      return "chapter";
    case "STORY_BIBLE":
    case "SERIES_BIBLE":
      return "story_bible";
    case "ARCHITECTURE":
    case "SERIES_ARCHITECTURE":
      return "architecture";
    case "FINGERPRINT":
    case "SERIES_FINGERPRINT":
      return "style";
    default:
      return "finding";
  }
}

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
    const body = await parseJsonBody(req);
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
    let result;
    try {
      result = await svc.update(
        docId,
        data.content,
        data.title,
        data.changeType,
        data.changeSource,
        data.expectedVersion
      );
    } catch (error) {
      if (error instanceof VersionConflictError) {
        // CAS rejected — nothing was written. Return the server's current
        // state (pinned to currentVersion, exactly like the chapter route) so
        // the editor can surface a merge dialog instead of silently clobbering.
        const current = await svc.readPinned(docId);
        const serverVersion =
          current?.document.currentVersion ?? doc.currentVersion;
        return NextResponse.json(
          {
            error: "version_conflict",
            serverVersion,
            currentVersion: serverVersion,
            serverContent: current?.content ?? "",
          },
          { status: 409 }
        );
      }
      throw error;
    }

    // Update Chapter.wordCount when CHAPTER_CONTENT is updated via API
    if (doc.type === "CHAPTER_CONTENT" && doc.chapterNumber && data.content) {
      const wordCount = data.content
        .replace(/```[\s\S]*?```/g, "")
        .replace(/[#*_~`>|-]/g, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      await db.chapter.updateMany({
        where: { bookId, chapterNumber: doc.chapterNumber },
        data: { wordCount },
      });
    }

    // Fire-and-forget vector indexing
    if (data.content) {
      onDocumentChanged(bookId, doc.type, data.content, {
        docId,
        userId: user.id,
        // D-77: thread the book's seriesId so document-API edits stay reachable by
        // series-filtered (cross-book) recall, matching the content/agent write paths;
        // a null-stamped chunk is invisible to every series query.
        seriesId: book.seriesId,
        chapterNumber: doc.chapterNumber ?? undefined,
      }).catch(() => {});
    }

    // Surface the numeric saved version so an optimistically-locked client can
    // stamp its next save; the full `document`/`version` objects stay for
    // back-compat with existing consumers.
    return NextResponse.json({ ...result, version: result.version.version });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
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

    // Fire-and-forget vector chunk cleanup
    deleteDocumentChunks(bookId, mapDocType(doc.type), docId).catch(() => {});

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
