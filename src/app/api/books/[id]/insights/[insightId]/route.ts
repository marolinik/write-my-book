import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveInsight, dismissInsight } from "@/lib/agents/blackboard";

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

    const body = await req.json();
    const { action } = body;

    if (action === "resolve") {
      const sessionId = body.sessionId ?? "manual";
      await resolveInsight(insightId, sessionId);
    } else if (action === "dismiss") {
      await dismissInsight(insightId);
    } else {
      return NextResponse.json(
        { error: 'action must be "resolve" or "dismiss"' },
        { status: 400 }
      );
    }

    const updated = await db.bookInsight.findUnique({
      where: { id: insightId },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "PATCH /api/books/:id/insights/:insightId error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to update insight" },
      { status: 500 }
    );
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
