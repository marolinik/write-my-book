import { NextRequest, NextResponse } from "next/server";
import { enqueueExport } from "@/lib/queue/export-queue";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";
import { exportRequestSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/export — queue a manuscript export (202 + job id). */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const body = await parseJsonBody(req);
    const data = exportRequestSchema.parse(body);

    // Wave 7 / D22: the conversion runs on the worker; one export per writer.
    const queued = await enqueueExport({ kind: "book", userId: user.id, targetId: bookId, request: data });
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
    console.error("POST /api/books/:id/export error:", error);
    return NextResponse.json({ error: "Export failed", code: "EXPORT_FAILED" }, { status: 500 });
  }
}

/** GET /api/books/:id/export — list previous exports. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const storage = getBookStorage(user.id, bookId);
    // P2-77: list only exports/ and sort by when each file was written.
    const files = await storage.listDetailed("exports/*");

    // Filter out temp assembled files
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/export error:", error);
    return NextResponse.json(
      { error: "Failed to list exports" },
      { status: 500 }
    );
  }
}
