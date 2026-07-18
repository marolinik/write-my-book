import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  dismissedPatternQuerySchema,
  createDismissedPatternSchema,
} from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/editorial/dismiss-pattern — Query dismissed patterns. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const query = dismissedPatternQuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );

    const patterns = await db.dismissedPattern.findMany({
      where: {
        bookId,
        chapterNumber: query.chapterNumber,
        agentType: query.agentType,
      },
      orderBy: { dismissedAt: "desc" },
    });

    return NextResponse.json({ patterns });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error(
      "GET /api/books/:id/editorial/dismiss-pattern error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to query dismissed patterns" },
      { status: 500 }
    );
  }
}

/** POST /api/books/:id/editorial/dismiss-pattern — Create or upsert a dismissed pattern. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const body = await parseJsonBody(req);
    const data = createDismissedPatternSchema.parse(body);

    const pattern = await db.dismissedPattern.upsert({
      where: {
        bookId_chapterNumber_agentType_patternHash: {
          bookId,
          chapterNumber: data.chapterNumber,
          agentType: data.agentType,
          patternHash: data.patternHash,
        },
      },
      create: {
        bookId,
        chapterNumber: data.chapterNumber,
        agentType: data.agentType,
        patternHash: data.patternHash,
        reason: data.reason,
      },
      update: {
        reason: data.reason,
        dismissedAt: new Date(),
      },
    });

    return NextResponse.json({ pattern });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error(
      "POST /api/books/:id/editorial/dismiss-pattern error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to create dismissed pattern" },
      { status: 500 }
    );
  }
}
