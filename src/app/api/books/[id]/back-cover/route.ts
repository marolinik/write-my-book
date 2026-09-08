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
 * UDG round-8 (Igor/Olivera): user-uploaded BACK cover, stored as a binary object in
 * the book's S3 bucket under `back-cover/<uuid>.<ext>`, with its key saved on
 * Book.backCoverUrl. Served through GET; bound into export as a trailing back-cover
 * page via the same tempdir-rewrite containment as the front cover (never embed S3 URL).
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

    const storage = getBookStorage(user.id, id);
    const key = `back-cover/${randomUUID()}.${ext}`;

    const existingBackCover = await db.book
      .findFirst({ where: { id }, select: { backCoverUrl: true } })
      .then((b) => b?.backCoverUrl ?? null);
    await storage.writeBuffer(key, buffer, mime);
    await db.book.update({ where: { id }, data: { backCoverUrl: key } });
    if (existingBackCover && existingBackCover !== key) {
      await storage.delete(existingBackCover).catch(() => undefined);
    }

    return NextResponse.json({ backCoverUrl: key });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("PUT /api/books/:id/back-cover error:", error);
    return NextResponse.json({ error: "Failed to upload back cover" }, { status: 500 });
  }
}

/** GET /api/books/:id/back-cover — serve the uploaded back-cover bytes for preview. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const book = await db.book.findFirst({
      where: { id, userId: user.id },
      select: { backCoverUrl: true },
    });
    if (!book || !book.backCoverUrl) {
      return NextResponse.json({ error: "No back cover set" }, { status: 404 });
    }
    const storage = getBookStorage(user.id, id);
    const extMatch = /\.([a-z0-9]+)$/i.exec(book.backCoverUrl);
    const mime =
      extMatch && ALLOWED_MIME[`image/${extMatch[1].toLowerCase()}`]
        ? `image/${extMatch[1].toLowerCase()}`
        : "image/jpeg";
    const buffer = await storage.readBuffer(book.backCoverUrl);
    if (!buffer) {
      return NextResponse.json({ error: "Back cover not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/back-cover error:", error);
    return NextResponse.json({ error: "Failed to load back cover" }, { status: 500 });
  }
}

/** DELETE /api/books/:id/back-cover — clear the current back cover. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const book = await db.book.findFirst({
      where: { id, userId: user.id },
      select: { backCoverUrl: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    if (book.backCoverUrl) {
      await getBookStorage(user.id, id).delete(book.backCoverUrl).catch(() => undefined);
      await db.book.update({ where: { id }, data: { backCoverUrl: null } });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/books/:id/back-cover error:", error);
    return NextResponse.json({ error: "Failed to clear back cover" }, { status: 500 });
  }
}