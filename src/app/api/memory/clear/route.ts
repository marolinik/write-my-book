import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clearBookMemory } from "@/lib/vector";
import { memoryClearSchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(request);

    const parsed = memoryClearSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input. Requires bookId (UUID) and confirm: true" },
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

    await clearBookMemory(bookId);

    return NextResponse.json({
      success: true,
      cleared: true,
    });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    console.error("[memory/clear] Error:", error);
    return NextResponse.json(
      { error: "Failed to clear memory" },
      { status: 500 }
    );
  }
}
