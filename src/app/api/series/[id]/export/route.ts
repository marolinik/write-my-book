import { NextRequest, NextResponse } from "next/server";
import { enqueueExport } from "@/lib/queue/export-queue";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { exportRequestSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/series/:id/export — queue a series omnibus export (202 + job id). */
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

    // Wave 7 / D22: the conversion runs on the worker; one export per writer.
    const queued = await enqueueExport({ kind: "series", userId: user.id, targetId: seriesId, request: data });
    if (!queued) {
      return NextResponse.json(
        { error: "An export is already running", code: "RATE_LIMITED" },
        { status: 429 }
      );
    }
    return NextResponse.json({ jobId: queued.jobId, status: "queued" }, { status: 202 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("POST /api/series/:id/export error:", error);
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