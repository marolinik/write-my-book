import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { inferPreferenceFromNegativeFeedback } from "@/lib/agents/writer-memory";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  suggestionId: z.string().min(1).max(100),
  suggestionType: z.string().min(1).max(100),
  positive: z.boolean(),
  suggestionText: z.string().max(500).optional(),
});

/**
 * POST /api/books/[id]/feedback
 * Records thumbs-up/down feedback on AI suggestions. Repeat votes on the
 * same suggestion toggle direction instead of creating duplicates.
 * Negative-feedback patterns feed learned writer-memory preferences that
 * reach every future agent prompt.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;
    const body = await parseJsonBody(request);
    const data = feedbackSchema.parse(body);

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      select: { id: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    await db.suggestionFeedback.upsert({
      where: {
        userId_suggestionId: {
          userId: user.id,
          suggestionId: data.suggestionId,
        },
      },
      create: {
        bookId,
        userId: user.id,
        suggestionId: data.suggestionId,
        suggestionType: data.suggestionType,
        positive: data.positive,
        suggestionText: data.suggestionText ?? null,
      },
      update: { positive: data.positive },
    });

    if (!data.positive) {
      try {
        await inferPreferenceFromNegativeFeedback(
          user.id,
          bookId,
          data.suggestionType
        );
      } catch (err) {
        // Inference failure must never fail the feedback POST
        console.error("[Feedback] preference inference failed:", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const invalidJson = invalidJsonBodyResponse(err);
    if (invalidJson) return invalidJson;
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: err.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record feedback" },
      { status: 500 }
    );
  }
}
