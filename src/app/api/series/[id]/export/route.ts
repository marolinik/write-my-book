import { NextRequest, NextResponse } from "next/server";
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

    const result = await exportSeriesOmnibus({
      userId: user.id,
      seriesId,
      format: data.format,
      isDraft: data.isDraft,
      sceneBreakGlyph: data.sceneBreakGlyph,
      template: data.template,
    });

    return NextResponse.json(result);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("POST /api/series/:id/export error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Series export failed" },
      { status: 500 }
    );
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
    const files = await storage.list("exports/*");
    const exports = files
      .filter((f) => !f.includes("_assembled-"))
      .map((f) => {
        const filename = f.split("/").pop() ?? f;
        const ext = filename.split(".").pop() ?? "";
        return { storageKey: f, filename, format: ext };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename));

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