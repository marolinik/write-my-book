import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { coverUploadSchema } from "@/lib/validation";
import { getBookStorage } from "@/lib/storage";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_COVER_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * UDG round-5 (Igor): user-uploaded book cover, stored as a binary object in the
 * book's S3 bucket under `cover/<uuid>.<ext>`, with its key saved on Book.coverUrl.
 * Served through GET (readBuffer) — there is no public/presigned URL for S3 in
 * this app, so all previews go through this authenticated route; the bytes are
 * later bound into export front matter by the export pipeline.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const book = await db.book.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const body = await parseJsonBody(req);
    const { dataUrl } = coverUploadSchema.parse(body);

    // dataUrl form: data:<mime>;base64,<bytes>
    const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
    if (!m) {
      return NextResponse.json(
        { error: "Invalid image payload — expected a base64 data URL" },
        { status: 400 }
      );
    }
    const mime = m[1].toLowerCase();
    const ext = ALLOWED_MIME[mime];
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported image type — allow jpeg, png, webp" },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: "Image too large — 8 MB max" },
        { status: 400 }
      );
    }

    const storage = getBookStorage(user.id, id);
    const key = `cover/${randomUUID()}.${ext}`;

    // Best-effort cleanup of a previous cover so orphans don't accumulate, then
    // write the new bytes last so a failure never leaves the DB pointing at a
    // partially-written object.
    const existingCover = await db.book
      .findFirst({ where: { id }, select: { coverUrl: true } })
      .then((b) => b?.coverUrl ?? null);
    await storage.writeBuffer(key, buffer, mime);
    await db.book.update({ where: { id }, data: { coverUrl: key } });
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
    console.error("PUT /api/books/:id/cover error:", error);
    return NextResponse.json(
      { error: "Failed to upload cover" },
      { status: 500 }
    );
  }
}

/** GET /api/books/:id/cover — serve the uploaded cover bytes for preview. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const book = await db.book.findFirst({
      where: { id, userId: user.id },
      select: { coverUrl: true },
    });
    if (!book || !book.coverUrl) {
      return NextResponse.json({ error: "No cover set" }, { status: 404 });
    }
    const storage = getBookStorage(user.id, id);
    const extMatch = /\.([a-z0-9]+)$/i.exec(book.coverUrl);
    const mime =
      extMatch && ALLOWED_MIME[`image/${extMatch[1].toLowerCase()}`]
        ? `image/${extMatch[1].toLowerCase()}`
        : "image/jpeg";
    const buffer = await storage.readBuffer(book.coverUrl);
    if (!buffer) {
      return NextResponse.json({ error: "Cover not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/cover error:", error);
    return NextResponse.json({ error: "Failed to load cover" }, { status: 500 });
  }
}

/** DELETE /api/books/:id/cover — clear the current cover. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const book = await db.book.findFirst({
      where: { id, userId: user.id },
      select: { coverUrl: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    if (book.coverUrl) {
      await getBookStorage(user.id, id).delete(book.coverUrl).catch(() => undefined);
      await db.book.update({ where: { id }, data: { coverUrl: null } });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/books/:id/cover error:", error);
    return NextResponse.json({ error: "Failed to clear cover" }, { status: 500 });
  }
}