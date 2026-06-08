import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const body = await req.json();
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
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A character lens with that name already exists for this book" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
