import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import {
  scanDocumentContent,
  regenerationWorkflowFor,
} from "@/lib/documents/damage-scan";

/**
 * GET /api/books/:id/documents/damage
 *
 * O3 — documents written before the encoding and language fixes still carry
 * their damage, and the writer had no way to see which ones. U+FFFD is
 * unrecoverable (the original bytes are gone), so those can only be
 * regenerated; this names them and says which workflow rebuilds each.
 *
 * Only book-level documents are scanned. Chapter prose is the writer's own work
 * and nothing here may offer to regenerate it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true, language: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const docs = await db.document.findMany({
      where: { bookId, chapterNumber: null },
      select: { id: true, type: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });

    const service = new DocumentService(user.id, bookId);
    const damaged = [];

    for (const doc of docs) {
      const workflow = regenerationWorkflowFor(doc.type);
      // A document nothing can rebuild is not worth alarming the writer about:
      // he would be told it is broken with no way forward.
      if (!workflow) continue;

      const read = await service.read(doc.id).catch(() => null);
      if (!read) continue;

      const report = scanDocumentContent(read.content, book.language);
      if (!report.damaged) continue;

      damaged.push({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        updatedAt: doc.updatedAt,
        reasons: report.reasons,
        recoverable: report.recoverable,
        regenerateWorkflow: workflow,
      });
    }

    return NextResponse.json({ damaged, scanned: docs.length });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/documents/damage error:", error);
    return NextResponse.json(
      { error: "Failed to scan documents" },
      { status: 500 }
    );
  }
}
