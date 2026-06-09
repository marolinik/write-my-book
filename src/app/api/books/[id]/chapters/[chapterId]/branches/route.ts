import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/books/[id]/chapters/[chapterId]/branches
 * Returns list of branches for a chapter.
 * TODO: Implement with DocumentVersion branch tagging.
 */
export async function GET() {
  await requireUser();
  // Return empty array — no branches yet
  return NextResponse.json([]);
}

/**
 * POST /api/books/[id]/chapters/[chapterId]/branches
 * Creates a new branch for a chapter.
 * TODO: Implement branch creation.
 */
export async function POST() {
  await requireUser();
  return NextResponse.json(
    { error: "Branching not yet implemented" },
    { status: 501 }
  );
}
