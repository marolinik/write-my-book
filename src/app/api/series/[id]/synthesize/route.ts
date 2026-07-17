import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { synthesizeSchema } from "@/lib/validation";
import {
  synthesizeToSeries,
  listBookContributions,
} from "@/lib/series";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/series/:id/synthesize?artifactType=... — list book contributions. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const artifactType = req.nextUrl.searchParams.get("artifactType");

    if (!artifactType) {
      return NextResponse.json(
        { error: "artifactType query parameter is required" },
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

    const contributions = await listBookContributions(
      user.id,
      seriesId,
      artifactType
    );

    return NextResponse.json(contributions);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series/:id/synthesize error:", error);
    return NextResponse.json(
      { error: "Failed to list contributions" },
      { status: 500 }
    );
  }
}

/** POST /api/series/:id/synthesize — synthesize a book's artifact into the series doc. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;
    const body = await parseJsonBody(req);
    const data = synthesizeSchema.parse(body);

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

    const success = await synthesizeToSeries(
      user.id,
      seriesId,
      data.bookId,
      data.bookNumber,
      data.artifactType
    );

    return NextResponse.json({ success });
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
    console.error("POST /api/series/:id/synthesize error:", error);
    return NextResponse.json(
      { error: "Failed to synthesize" },
      { status: 500 }
    );
  }
}
