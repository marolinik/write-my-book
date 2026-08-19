import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { restoreVersionSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

/** POST /api/books/:id/documents/:docId/restore — restore a version. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, docId } = await params;
    const body = await parseJsonBody(req);
    const { version } = restoreVersionSchema.parse(body);

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
    const result = await svc.restoreVersion(docId, version);

    return NextResponse.json(result);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error(
      "POST /api/books/:id/documents/:docId/restore error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}
