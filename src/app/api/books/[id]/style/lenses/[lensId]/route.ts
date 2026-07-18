import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { legacyRouteErrorResponse } from "@/lib/api/legacy-route-errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId, lensId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const lens = await db.characterLens.findFirst({
      where: { id: lensId, bookId },
    });
    if (!lens) {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }

    // Hand-validated legacy body (no Zod schema here) — keep the pre-D-01
    // any-typed access; the field checks below are the validation.
    const body = (await parseJsonBody(req)) as Record<string, any>;
    const updated = await db.characterLens.update({
      where: { id: lensId },
      data: {
        ...(body.characterName !== undefined && { characterName: body.characterName }),
        ...(body.sensoryPriority !== undefined && { sensoryPriority: body.sensoryPriority }),
        ...(body.metaphorDomain !== undefined && { metaphorDomain: body.metaphorDomain }),
        ...(body.interiorStyle !== undefined && { interiorStyle: body.interiorStyle }),
        ...(body.vocabularyRegister !== undefined && { vocabularyRegister: body.vocabularyRegister }),
        ...(body.blindSpots !== undefined && { blindSpots: body.blindSpots }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    // D-14: don't mislabel every failure as 401 — class it honestly.
    return legacyRouteErrorResponse(
      error,
      "PATCH /api/books/:id/style/lenses/:lensId",
      "Failed to update character lens"
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; lensId: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId, lensId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Fence the lens to this owned book — deleting by id alone let any user
    // destroy any lens by guessing its id (cross-tenant delete). Mirror PATCH.
    const { count } = await db.characterLens.deleteMany({
      where: { id: lensId, bookId },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Lens not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    // D-14: don't mislabel every failure as 401 — class it honestly.
    return legacyRouteErrorResponse(
      error,
      "DELETE /api/books/:id/style/lenses/:lensId",
      "Failed to delete character lens"
    );
  }
}
