import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createInsight } from "@/lib/agents/blackboard";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/insights — List active insights with optional filters. */
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
    const status = url.searchParams.get("status") ?? "active";
    const domain = url.searchParams.get("domain");

    const where: Record<string, unknown> = { bookId };
    if (status) where.status = status;
    if (domain) where.domain = domain;

    const [insights, total] = await Promise.all([
      db.bookInsight.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
      db.bookInsight.count({ where }),
    ]);

    return NextResponse.json({ insights, total });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/books/:id/insights error:", error);
    return NextResponse.json(
      { error: "Failed to list insights" },
      { status: 500 }
    );
  }
}

/** POST /api/books/:id/insights — Create a manual insight. */
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

    // Hand-validated legacy body (no Zod schema here) — keep the pre-D-01
    // any-typed access; the field checks below are the validation.
    const body = (await parseJsonBody(req)) as Record<string, any>;

    // Validate required fields
    const { sourceAgentType, insightType, domain, summary, detail } = body;
    if (!sourceAgentType || !insightType || !domain || !summary || !detail) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: sourceAgentType, insightType, domain, summary, detail",
        },
        { status: 400 }
      );
    }

    const validTypes = ["WARNING", "SUGGESTION", "FLAG", "CONSTRAINT"];
    if (!validTypes.includes(insightType)) {
      return NextResponse.json(
        { error: `insightType must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await createInsight({
      bookId,
      sourceSessionId: body.sourceSessionId ?? undefined,
      sourceAgentType,
      insightType,
      domain,
      summary,
      detail,
      targetAgents: body.targetAgents ?? [],
      chapterScope: body.chapterScope ?? [],
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/books/:id/insights error:", error);
    return NextResponse.json(
      { error: "Failed to create insight" },
      { status: 500 }
    );
  }
}
