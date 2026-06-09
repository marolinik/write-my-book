import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/books/[id]/feedback
 * Records thumbs-up/down feedback on AI suggestions.
 * Used to improve future AI suggestion quality.
 * TODO: Store feedback in DB and use for prompt tuning.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id: bookId } = await params;
  const body = await request.json();

  const { suggestionId, positive, suggestionType } = body;

  // For now, just acknowledge the feedback
  // Future: store in a feedback table and use for prompt optimization
  console.log(
    `[Feedback] book=${bookId} suggestion=${suggestionId} type=${suggestionType} positive=${positive}`
  );

  return NextResponse.json({ ok: true });
}
