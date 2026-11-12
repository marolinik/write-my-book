import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBookSchema } from "@/lib/validation";
import { bookLanguageFromPreference } from "@/lib/i18n/book-languages";
import { generateS3Prefix, generateSeriesS3Prefix } from "@/lib/utils";
import { checkPlanAccess } from "@/lib/billing/plan-gating";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

/** GET /api/books — list all books for the current user. */
export async function GET() {
  try {
    const user = await requireUser();

    const books = await db.book.findMany({
      where: { userId: user.id, archivedAt: null },
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
/**
 * P2-11: two creates racing past the duplicate-name check, or a book number
 * already taken in the series (the UI sends the number the writer typed),
 * trip a unique constraint. That is the writer's conflict to resolve, not a
 * server fault; `meta.target` says which one.
 */
function bookCreateConflict(error: unknown): NextResponse | null {
  const err = error as { code?: string; meta?: { target?: unknown } } | null;
  if (err?.code !== "P2002") return null;
  const target = JSON.stringify(err.meta?.target ?? "");
  const message = /book_?number/i.test(target)
    ? "This series already has a book with that number"
    : "A book with this name already exists";
  return NextResponse.json({ error: message, code: "CONFLICT" }, { status: 409 });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // Plan-gating: check if user's plan allows creating more books
    const access = await checkPlanAccess(user.id, "create_book");
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason, upgradeToTier: access.upgradeToTier },
        { status: 403 }
      );
    }

    const body = await parseJsonBody(req);
    const data = createBookSchema.parse(body);

    // Check for duplicate name
    const existing = await db.book.findFirst({
      where: { userId: user.id, name: data.name },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A book with this name already exists" },
        { status: 409 }
      );
    }

    // A book may only join a series the caller owns (prevents cross-user seriesId).
    if (data.seriesId) {
      const series = await db.series.findFirst({
        where: { id: data.seriesId, userId: user.id },
      });
      if (!series) {
        return NextResponse.json(
          { error: "Series not found" },
          { status: 404 }
        );
      }
    }

    // P2-11: the row, its settings, Chapter 1 and the prefix land together or
    // not at all; a half-made book (no settings, no Chapter 1) cannot remain.
    const { updatedBook, firstChapter } = await db.$transaction(async (tx) => {
    const book = await tx.book.create({
      data: {
        userId: user.id,
        name: data.name,
        genre: data.genre ?? null,
        // The writer's chosen language, not a hardcoded "en": book.language is
        // what every agent prompt enforces (CRITICAL LANGUAGE REQUIREMENT), so
        // defaulting to English made agents answer in English to a writer who
        // had set the app to Serbian. The preference is mapped to a book
        // language, never copied raw (an old "sr-RS" row is not one).
        language: data.language ?? bookLanguageFromPreference(user.preferredLanguage),
        seriesId: data.seriesId ?? null,
        bookNumber: data.bookNumber ?? 1,
      },
    });

    // Generate S3 prefix
    const s3Prefix = data.seriesId
      ? generateSeriesS3Prefix(user.id, data.seriesId, book.bookNumber)
      : generateS3Prefix(user.id, book.id);

    // Create default settings
    await tx.bookSettings.create({
      data: { bookId: book.id },
    });

    // Write-first onboarding: create an empty Chapter 1 so the writer lands
    // directly in a blank editor. No CHAPTER_CONTENT document yet — that is
    // created on first save.
    const firstChapter = await tx.chapter.create({
      data: { bookId: book.id, actNumber: 1, chapterNumber: 1, title: null },
    });

    // D-194: count that placeholder. `chapter_count` defaults to 0, so leaving
    // it alone here started EVERY in-product book off-by-one (measured 1 vs 2,
    // 7 vs 8 on real books) and every later +1/-1 delta rode the wrong base.
    // Folded into the s3Prefix update so book creation still writes once.
    const updatedBook = await tx.book.update({
      where: { id: book.id },
      data: { s3Prefix, chapterCount: 1 },
    });
    return { updatedBook, firstChapter };
    });

    return NextResponse.json(
      { ...updatedBook, firstChapterId: firstChapter.id },
      { status: 201 }
    );
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    const conflict = bookCreateConflict(error);
    if (conflict) return conflict;
    console.error("POST /api/books error:", error);
    return NextResponse.json(
      { error: "Failed to create book" },
      { status: 500 }
    );
  }
}
