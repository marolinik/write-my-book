import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateSeriesSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { getSeriesStorage } from "@/lib/storage";
import { purgeStorage } from "@/lib/storage/purge";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/series/:id — get a series with its books. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const series = await db.series.findFirst({
      where: { id, userId: user.id },
      include: {
        books: {
          orderBy: { bookNumber: "asc" },
          include: {
            _count: { select: { chapters: true } },
          },
        },
        documents: {
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    return NextResponse.json(series);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series/:id error:", error);
    return NextResponse.json(
      { error: "Failed to fetch series" },
      { status: 500 }
    );
  }
}

/** PATCH /api/series/:id — update a series. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await parseJsonBody(req);
    const data = updateSeriesSchema.parse(body);

    const existing = await db.series.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const series = await db.series.update({
      where: { id },
      data,
    });

    return NextResponse.json(series);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("PATCH /api/series/:id error:", error);
    return NextResponse.json(
      { error: "Failed to update series" },
      { status: 500 }
    );
  }
}

/** DELETE /api/series/:id — delete a series (books become standalone). */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const existing = await db.series.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    // P2-37: detach the books (they become standalone) and delete the series
    // together, or neither.
    await db.$transaction(async (tx) => {
      await tx.book.updateMany({
        where: { seriesId: id },
        data: { seriesId: null },
      });
      await tx.series.delete({ where: { id } });
    });

    // Then the series' own objects: its documents and their versions, the
    // cover and the omnibus exports. Best effort after the row is gone: a
    // storage outage is logged, and the writer's delete still stands.
    await purgeStorage(getSeriesStorage(user.id, id)).catch((error) =>
      console.error(`DELETE /api/series/:id: storage purge failed for series ${id}:`, error)
    );

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/series/:id error:", error);
    return NextResponse.json(
      { error: "Failed to delete series" },
      { status: 500 }
    );
  }
}
