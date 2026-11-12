import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createInsight } from "@/lib/agents/blackboard";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { legacyRouteErrorResponse } from "@/lib/api/legacy-route-errors";
import { createInsightSchema, insightsQuerySchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/insights — List insights with optional filters, paginated (P2-10). */
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

    const query = insightsQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries())
    );

    const where: Record<string, unknown> = { bookId, status: query.status };
    if (query.domain) where.domain = query.domain;

    const [insights, total] = await Promise.all([
      db.bookInsight.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      db.bookInsight.count({ where }),
    ]);

    return NextResponse.json({ insights, total });
  } catch (error) {
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    return legacyRouteErrorResponse(error, "GET /api/books/:id/insights", "Failed to list insights");
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

    // P2-10: typed and bounded before anything reaches Prisma or a prompt.
    const body = createInsightSchema.parse(await parseJsonBody(req));

    const result = await createInsight({
      bookId,
      sourceSessionId: body.sourceSessionId,
      sourceAgentType: body.sourceAgentType,
      insightType: body.insightType,
      domain: body.domain,
      summary: body.summary,
      detail: body.detail,
      targetAgents: body.targetAgents ?? [],
      chapterScope: body.chapterScope ?? [],
      expiresAt: body.expiresAt,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    return legacyRouteErrorResponse(error, "POST /api/books/:id/insights", "Failed to create insight");
  }
}
