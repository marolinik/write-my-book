import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";
import { exportRequestSchema } from "@/lib/validation";
import { exportManuscript } from "@/lib/import-export/export-pipeline";

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/books/:id/export — trigger a manuscript export. */
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

    const body = await req.json();
    const data = exportRequestSchema.parse(body);

    const storage = getBookStorage(user.id, bookId);

    // Real chapter titles live in the DB, not the manuscript markdown — thread
    // them into the pipeline so headings/TOC/EPUB titles are correct (F9/F10).
    const chapters = await db.chapter.findMany({
      where: { bookId },
      select: { chapterNumber: true, title: true },
    });
    const chapterTitles = new Map<number, string>();
    for (const ch of chapters) {
      if (ch.title) chapterTitles.set(ch.chapterNumber, ch.title);
    }

    const result = await exportManuscript(
      {
        bookId,
        format: data.format,
        isDraft: data.isDraft,
        sceneBreakGlyph: data.sceneBreakGlyph,
        template: data.template,
        chapterTitles,
      },
      storage,
      book.name,
      book.language
    );

    return NextResponse.json(result);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error("POST /api/books/:id/export error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Export failed" },
      { status: 500 }
    );
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
    const files = await storage.list("exports/*");

    // Filter out temp assembled files
    const exports = files
      .filter((f) => !f.includes("_assembled-"))
      .map((f) => {
        const filename = f.split("/").pop() ?? f;
        const ext = filename.split(".").pop() ?? "";
        return { storageKey: f, filename, format: ext };
      })
      .sort((a, b) => b.filename.localeCompare(a.filename)); // newest first

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
