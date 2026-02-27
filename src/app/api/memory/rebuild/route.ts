import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rebuildBookIndex } from "@/lib/vector";
import { memoryRebuildSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();

    const parsed = memoryRebuildSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { bookId } = parsed.data;

    // Verify book belongs to user
    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });

    if (!book) {
      return NextResponse.json(
        { error: "Book not found" },
        { status: 404 }
      );
    }

    const result = await rebuildBookIndex(bookId, user.id);

    return NextResponse.json({
      success: true,
      chunksIndexed: result.chunksIndexed,
    });
  } catch (error) {
    console.error("[memory/rebuild] Error:", error);
    return NextResponse.json(
      { error: "Failed to rebuild memory index" },
      { status: 500 }
    );
  }
}
