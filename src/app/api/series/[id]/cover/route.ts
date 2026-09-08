import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { coverUploadSchema } from "@/lib/validation";
import { getSeriesStorage } from "@/lib/storage";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_COVER_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * UDG round-9 (Olivera/Igor): user-uploaded SERIES cover, stored as a binary object
 * under `getSeriesStorage(userId, seriesId)` at `cover/<uuid>.<ext>`, with its key kept
 * on Series.coverUrl. Served through GET and bound into omnibus exports as the cover page
 * via the same tempdir-rewrite containment as book covers (never embed an S3 URL).
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const series = await db.series.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const body = await parseJsonBody(req);
    const { dataUrl } = coverUploadSchema.parse(body);

    const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
    if (!m) {
      return NextResponse.json({ error: "Invalid image payload — expected a base64 data URL" }, { status: 400 });
    }
    const mime = m[1].toLowerCase();
    const ext = ALLOWED_MIME[mime];
    if (!ext) {
      return NextResponse.json({ error: "Unsupported image type — allow jpeg, png, webp" }, { status: 400 });
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(m[2], "base64");
    } catch {
      return NextResponse.json({ error: "Invalid base64 data" }, { status: 400 });
    }
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty image" }, { status: 400 });
    }
    if (buffer.byteLength > MAX_COVER_BYTES) {
      return NextResponse.json({ error: "Image too large — 8 MB max" }, { status: 400 });
    }

    const storage = getSeriesStorage(user.id, id);
    const key = `cover/${randomUUID()}.${ext}`;

    const existingCover = await db.series
      .findFirst({ where: { id }, select: { coverUrl: true } })
      .then((s) => s?.coverUrl ?? null);
    await storage.writeBuffer(key, buffer, mime);
    await db.series.update({ where: { id }, data: { coverUrl: key } });
    if (existingCover && existingCover !== key) {
      await storage.delete(existingCover).catch(() => undefined);
    }

    return NextResponse.json({ coverUrl: key });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("PUT /api/series/:id/cover error:", error);
    return NextResponse.json({ error: "Failed to upload series cover" }, { status: 500 });
  }
}

/** GET /api/series/:id/cover — serve the uploaded series-cover bytes for preview. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const series = await db.series.findFirst({
      where: { id, userId: user.id },
      select: { coverUrl: true },
    });
    if (!series || !series.coverUrl) {
      return NextResponse.json({ error: "No series cover set" }, { status: 404 });
    }
    const storage = getSeriesStorage(user.id, id);
    const extMatch = /\.([a-z0-9]+)$/i.exec(series.coverUrl);
    const mime =
      extMatch && ALLOWED_MIME[`image/${extMatch[1].toLowerCase()}`]
        ? `image/${extMatch[1].toLowerCase()}`
        : "image/jpeg";
    const buffer = await storage.readBuffer(series.coverUrl);
    if (!buffer) {
      return NextResponse.json({ error: "Series cover not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series/:id/cover error:", error);
    return NextResponse.json({ error: "Failed to load series cover" }, { status: 500 });
  }
}

/** DELETE /api/series/:id/cover — clear the current series cover. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const series = await db.series.findFirst({
      where: { id, userId: user.id },
      select: { coverUrl: true },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }
    if (series.coverUrl) {
      await getSeriesStorage(user.id, id).delete(series.coverUrl).catch(() => undefined);
      await db.series.update({ where: { id }, data: { coverUrl: null } });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/series/:id/cover error:", error);
    return NextResponse.json({ error: "Failed to clear series cover" }, { status: 500 });
  }
}