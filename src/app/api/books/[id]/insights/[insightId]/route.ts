import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveInsight, dismissInsight } from "@/lib/agents/blackboard";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";
import { legacyRouteErrorResponse } from "@/lib/api/legacy-route-errors";
import { updateInsightSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string; insightId: string }> };

/** PATCH /api/books/:id/insights/:insightId — Resolve or dismiss an insight. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, insightId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const insight = await db.bookInsight.findFirst({
      where: { id: insightId, bookId },
    });
    if (!insight) {
      return NextResponse.json(
        { error: "Insight not found" },
        { status: 404 }
      );
    }

    // P2-10: the action is an enum and the resolving session id is bounded.
    const body = updateInsightSchema.parse(await parseJsonBody(req));

    if (body.action === "resolve") {
      await resolveInsight(insightId, body.sessionId ?? "manual");
    } else {
      await dismissInsight(insightId);
    }

    const updated = await db.bookInsight.findUnique({
      where: { id: insightId },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    return legacyRouteErrorResponse(error, "PATCH /api/books/:id/insights/:insightId", "Failed to update insight");
  }
}

/** DELETE /api/books/:id/insights/:insightId — Hard delete an insight. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, insightId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const insight = await db.bookInsight.findFirst({
      where: { id: insightId, bookId },
    });
    if (!insight) {
      return NextResponse.json(
        { error: "Insight not found" },
        { status: 404 }
      );
    }

    await db.bookInsight.delete({ where: { id: insightId } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "DELETE /api/books/:id/insights/:insightId error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to delete insight" },
      { status: 500 }
    );
  }
}
