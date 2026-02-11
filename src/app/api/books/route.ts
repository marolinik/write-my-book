import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBookSchema } from "@/lib/validation";
import { generateS3Prefix, generateSeriesS3Prefix } from "@/lib/utils";

/** GET /api/books — list all books for the current user. */
export async function GET() {
  try {
    const user = await requireUser();

    const books = await db.book.findMany({
      where: { userId: user.id },
      include: {
        series: { select: { id: true, title: true } },
        settings: true,
        _count: { select: { chapters: true, documents: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(books);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books error:", error);
    return NextResponse.json(
      { error: "Failed to fetch books" },
      { status: 500 }
    );
  }
}

/** POST /api/books — create a new book. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const data = createBookSchema.parse(body);

    const book = await db.book.create({
      data: {
        userId: user.id,
        name: data.name,
        genre: data.genre ?? null,
        language: data.language ?? "en",
        seriesId: data.seriesId ?? null,
        bookNumber: data.bookNumber ?? 1,
      },
    });

    // Generate S3 prefix
    const s3Prefix = data.seriesId
      ? generateSeriesS3Prefix(user.id, data.seriesId, book.bookNumber)
      : generateS3Prefix(user.id, book.id);

    const updatedBook = await db.book.update({
      where: { id: book.id },
      data: { s3Prefix },
    });

    // Create default settings
    await db.bookSettings.create({
      data: { bookId: book.id },
    });

    return NextResponse.json(updatedBook, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: error }, { status: 400 });
    }
    console.error("POST /api/books error:", error);
    return NextResponse.json(
      { error: "Failed to create book" },
      { status: 500 }
    );
  }
}
