import { NextRequest, NextResponse } from "next/server";
import { withExportSlot } from "@/lib/import-export/export-limits";
import { ExportConversionError } from "@/lib/import-export/export-pipeline";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportRequestSchema } from "@/lib/validation";
import { exportSeriesOmnibus } from "@/lib/import-export/export-pipeline";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/series/:id/export — export every book in a series as a single omnibus volume. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;

    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const body = await parseJsonBody(req);
    const data = exportRequestSchema.parse(body);

    // P2-76 / D19: one export per writer at a time; a second answers 429.
    const slot = await withExportSlot(user.id, () => exportSeriesOmnibus({
      userId: user.id,
      seriesId,
      format: data.format,
      isDraft: data.isDraft,
      sceneBreakGlyph: data.sceneBreakGlyph,
      template: data.template,
    }));
    if (!slot) {
      return NextResponse.json(
        { error: "An export is already running", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    const result = slot.value;

    return NextResponse.json(result);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    if (error instanceof ExportConversionError) {
      // P1-23: the writer is told it failed; the detail stays in the log.
      return NextResponse.json({ error: "Export failed", code: "CONVERSION_FAILED" }, { status: 502 });
    }
    console.error("POST /api/series/:id/export error:", error);
    // P2-8: never echo error.message (storage hosts, temp paths, Prisma text).
    return NextResponse.json({ error: "Export failed", code: "EXPORT_FAILED" }, { status: 500 });
  }
}

/** GET /api/series/:id/export — list previous series exports. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: seriesId } = await params;

    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const storage = (await import("@/lib/storage")).getSeriesStorage(user.id, seriesId);
    // P2-77: list only exports/ and sort by when each file was written.
    const files = await storage.listDetailed("exports/*");
    const exports = files
      .filter((f) => !f.key.includes("_assembled-"))
      .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0))
      .map((f) => {
        const filename = f.key.split("/").pop() ?? f.key;
        const ext = filename.split(".").pop() ?? "";
        return { storageKey: f.key, filename, format: ext, lastModified: f.lastModified };
      });

    return NextResponse.json({ exports });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: { error: "Unauthorized" as string } }, { status: 401 });
    }
    console.error("GET /api/series/:id/export error:", error);
    return NextResponse.json(
      { error: "Failed to list series exports" },
      { status: 500 }
    );
  }
}