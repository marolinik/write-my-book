import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";

type RouteParams = { params: Promise<{ id: string; filename: string }> };

const CONTENT_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  epub: "application/epub+zip",
  md: "text/markdown; charset=utf-8",
};

/** GET /api/books/:id/export/:filename — download an exported file. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, filename } = await params;

    // Sanitize filename to prevent path traversal
    const safeFilename = filename.replace(/[/\\..]/g, "").replace(/\.\./g, "");
    if (!safeFilename || safeFilename !== filename) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const storage = getBookStorage(user.id, bookId);
    const storageKey = `exports/${safeFilename}`;

    const buffer = await storage.readBuffer(storageKey);
    if (!buffer) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = safeFilename.split(".").pop() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/export/:filename error:", error);
    return NextResponse.json(
      { error: "Download failed" },
      { status: 500 }
    );
  }
}
