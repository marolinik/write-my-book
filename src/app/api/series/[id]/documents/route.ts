import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocumentSchema } from "@/lib/validation";
import { DocumentService } from "@/lib/documents";
import type { DocumentType } from "@/generated/prisma/enums";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/series/:id/documents — list documents for a series. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;

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
    const documents = await svc.list();

    return NextResponse.json(documents);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series/:id/documents error:", error);
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    );
  }
}

/** POST /api/series/:id/documents — create a series document. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const body = await req.json();
    const data = createDocumentSchema.parse(body);

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
    const document = await svc.create(
      data.type as DocumentType,
      data.content,
      data.title,
      data.chapterNumber,
      data.actNumber,
      data.changeSource
    );

    return NextResponse.json(document, { status: 201 });
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
    console.error("POST /api/series/:id/documents error:", error);
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    );
  }
}
