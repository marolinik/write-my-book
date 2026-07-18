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

    const profiles = await db.styleProfile.findMany({
      where: { userId: user.id, sourceBookId: bookId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        fingerprint: true,
        metrics: true,
        calibrationSamples: true,
        sourceBookId: true,
        sourceBookNumber: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const lenses = await db.characterLens.findMany({
      where: { bookId },
      orderBy: { characterName: "asc" },
    });

    return NextResponse.json({ profiles, lenses });
  } catch (error) {
    // D-14: don't mislabel every failure as 401 — class it honestly.
    return legacyRouteErrorResponse(
      error,
      "GET /api/books/:id/style",
      "Failed to fetch style profiles"
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
      select: { id: true, bookNumber: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Hand-validated legacy body (no Zod schema here) — keep the pre-D-01
    // any-typed access; the field checks below are the validation.
    const body = (await parseJsonBody(req)) as Record<string, any>;
    const { name, description, fingerprint } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const profile = await db.styleProfile.create({
      data: {
        userId: user.id,
        name,
        description: description || null,
        fingerprint: fingerprint || "",
        sourceBookId: bookId,
        sourceBookNumber: book.bookNumber,
      },
    });

    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    // D-14: don't mislabel every failure as 401 — class it honestly.
    return legacyRouteErrorResponse(
      error,
      "POST /api/books/:id/style",
      "Failed to create style profile"
    );
  }
}
