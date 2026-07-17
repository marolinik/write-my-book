import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateDocumentSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string; docId: string }> };

/** GET /api/series/:id/documents/:docId — get a series document with content. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId, docId } = await params;

    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });

    if (!series) {
      return NextResponse.json(
        { error: "Series not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, undefined, seriesId);
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
    console.error("GET /api/series/:id/documents/:docId error:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

/** PATCH /api/series/:id/documents/:docId — update a series document. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId, docId } = await params;
    const body = await parseJsonBody(req);
    const data = updateDocumentSchema.parse(body);

    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });

    if (!series) {
      return NextResponse.json(
        { error: "Series not found" },
        { status: 404 }
      );
    }

    const doc = await db.document.findFirst({
      where: { id: docId, seriesId },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, undefined, seriesId);
    const result = await svc.update(
      docId,
      data.content,
      data.title,
      data.changeType,
      data.changeSource
    );

    return NextResponse.json(result);
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
    console.error("PATCH /api/series/:id/documents/:docId error:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

/** DELETE /api/series/:id/documents/:docId — delete a series document. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId, docId } = await params;

    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });

    if (!series) {
      return NextResponse.json(
        { error: "Series not found" },
        { status: 404 }
      );
    }

    const doc = await db.document.findFirst({
      where: { id: docId, seriesId },
    });

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, undefined, seriesId);
    await svc.delete(docId);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/series/:id/documents/:docId error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
