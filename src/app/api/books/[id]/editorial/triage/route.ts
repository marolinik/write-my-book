import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { triageChapter, triageConfigured } from "@/lib/editorial/triage-service";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  chapterNumber: z.number().int().min(1),
});

/**
 * POST /api/books/:id/editorial/triage — judge a chapter's pending findings.
 *
 * Answers 200 with `{ judged: 0, reason: "disabled" }` rather than an error
 * when the owner has not turned the judge on. The panel treats an untriaged
 * chapter exactly as it treats one today, so "off" is a state, not a failure.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
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

    const body = await parseJsonBody(req);
    const { chapterNumber } = bodySchema.parse(body);

    if (!triageConfigured(process.env)) {
      return NextResponse.json({ judged: 0, unanswered: 0, requests: 0, reason: "disabled" });
    }

    const result = await triageChapter({ bookId, chapterNumber });
    return NextResponse.json(result);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if ((error as Error).message?.includes("JSON")) {
      const invalid = invalidJsonBodyResponse(error);
      if (invalid) return invalid;
    }
    console.error("POST /api/books/:id/editorial/triage error:", error);
    return NextResponse.json({ error: "Triage failed" }, { status: 500 });
  }
}
