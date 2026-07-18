import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { legacyRouteErrorResponse } from "@/lib/api/legacy-route-errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const lenses = await db.characterLens.findMany({
      where: { bookId },
      orderBy: { characterName: "asc" },
    });

    return NextResponse.json(lenses);
  } catch (error) {
    // D-14: don't mislabel every failure as 401 — class it honestly.
    return legacyRouteErrorResponse(
      error,
      "GET /api/books/:id/style/lenses",
      "Failed to fetch character lenses"
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Hand-validated legacy body (no Zod schema here) — keep the pre-D-01
    // any-typed access; the field checks below are the validation.
    const body = (await parseJsonBody(req)) as Record<string, any>;
    const { characterName, sensoryPriority, metaphorDomain, interiorStyle, vocabularyRegister, blindSpots } = body;

    if (!characterName || !sensoryPriority || !metaphorDomain || !interiorStyle || !vocabularyRegister) {
      return NextResponse.json({ error: "Required fields missing" }, { status: 400 });
    }

    const lens = await db.characterLens.create({
      data: {
        bookId,
        characterName,
        sensoryPriority,
        metaphorDomain,
        interiorStyle,
        vocabularyRegister,
        blindSpots: blindSpots || null,
      },
    });

    return NextResponse.json(lens, { status: 201 });
  } catch (error: any) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A character lens with that name already exists for this book" },
        { status: 409 }
      );
    }
    // D-14: don't mislabel every failure as 401 — class it honestly.
    return legacyRouteErrorResponse(
      error,
      "POST /api/books/:id/style/lenses",
      "Failed to create character lens"
    );
  }
}
