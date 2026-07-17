import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

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

    const body = await req.json();
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
