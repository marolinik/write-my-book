import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string; findingId: string }> };

/** POST /api/books/:id/editorial/findings/:findingId/undo — Revert finding to pending. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, findingId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const finding = await db.editFinding.findFirst({
      where: { id: findingId, bookId },
    });
    if (!finding) {
      return NextResponse.json(
        { error: "Finding not found" },
        { status: 404 }
      );
    }

    if (finding.status === "pending") {
      return NextResponse.json(
        { error: "Finding is already pending" },
        { status: 400 }
      );
    }

    // Reverse auto-applied text changes if the finding was applied with patches
    if (
      finding.status === "applied" &&
      finding.originalText &&
      finding.newText
    ) {
      const docService = new DocumentService(user.id, bookId);
      const doc = await docService.findByType(
        DocumentType.CHAPTER_CONTENT,
        finding.chapterNumber
      );

      if (doc) {
        const result = await docService.read(doc.id);
        if (result) {
          const index = result.content.indexOf(finding.newText);
          if (index !== -1) {
            // Reverse: replace newText back with originalText
            const restoredContent =
              result.content.substring(0, index) +
              finding.originalText +
              result.content.substring(index + finding.newText.length);

            await docService.update(
              doc.id,
              restoredContent,
              undefined,
              "revision",
              `undo-finding:${findingId}`
            );
          }
          // If newText not found, the chapter was edited further — just reset finding status
        }
      }
    }

    const updated = await db.editFinding.update({
      where: { id: findingId },
      data: {
        status: "pending",
        appliedAt: null,
        dismissReason: null,
      },
    });

    await db.editAction.create({
      data: {
        bookId,
        chapterNumber: finding.chapterNumber,
        actionType: "undo",
        findingId,
        description: `Undid ${finding.status} action on finding: ${finding.category}${finding.originalText ? " (text reverted)" : ""}`,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "POST /api/books/:id/editorial/findings/:findingId/undo error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to undo finding" },
      { status: 500 }
    );
  }
}
