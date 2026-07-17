import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { applyInheritanceSchema } from "@/lib/validation";
import {
  checkInheritanceState,
  applyInheritance,
} from "@/lib/series";
import type { DocumentType } from "@/generated/prisma/enums";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/series/:id/inherit?bookId=... — check inheritance state. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const bookId = req.nextUrl.searchParams.get("bookId");

    if (!bookId) {
      return NextResponse.json(
        { error: "bookId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify series ownership
    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // Verify book belongs to series
    const book = await db.book.findFirst({
      where: { id: bookId, seriesId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json(
        { error: "Book not found in this series" },
        { status: 404 }
      );
    }

    const state = await checkInheritanceState(user.id, seriesId, bookId);
    return NextResponse.json(state);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series/:id/inherit error:", error);
    return NextResponse.json(
      { error: "Failed to check inheritance state" },
      { status: 500 }
    );
  }
}

/** POST /api/series/:id/inherit — apply inheritance from series to book. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const body = await parseJsonBody(req);
    const data = applyInheritanceSchema.parse(body);

    // Verify series ownership
    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // Verify book belongs to series
    const book = await db.book.findFirst({
      where: { id: data.bookId, seriesId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json(
        { error: "Book not found in this series" },
        { status: 404 }
      );
    }

    const result = await applyInheritance(
      user.id,
      seriesId,
      data.bookId,
      data.documentTypes as DocumentType[] | undefined
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
    console.error("POST /api/series/:id/inherit error:", error);
    return NextResponse.json(
      { error: "Failed to apply inheritance" },
      { status: 500 }
    );
  }
}
