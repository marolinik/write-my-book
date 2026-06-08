import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  findingsQuerySchema,
  batchCreateFindingsSchema,
} from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/books/:id/editorial/findings — List findings with filters. */
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
    const query = findingsQuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );

    const where: Record<string, unknown> = { bookId };
    if (query.chapterNumber !== undefined)
      where.chapterNumber = query.chapterNumber;
    if (query.severity) where.severity = query.severity;
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.agentType) where.agentType = query.agentType;

    const [findings, total] = await Promise.all([
      db.editFinding.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      db.editFinding.count({ where }),
    ]);

    return NextResponse.json({ findings, total });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error("GET /api/books/:id/editorial/findings error:", error);
    return NextResponse.json(
      { error: "Failed to list findings" },
      { status: 500 }
    );
  }
}

/** POST /api/books/:id/editorial/findings — Batch create findings. */
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

    const body = await req.json();
    const data = batchCreateFindingsSchema.parse(body);

    const result = await db.editFinding.createMany({
      data: data.findings.map((f) => ({
        bookId,
        chapterNumber: f.chapterNumber,
        severity: f.severity,
        category: f.category,
        description: f.description,
        suggestion: f.suggestion,
        originalText: f.originalText,
        newText: f.newText,
        locationStart: f.locationStart,
        locationEnd: f.locationEnd,
        agentType: f.agentType ?? "agent",
        sessionId: f.sessionId,
      })),
    });

    return NextResponse.json({ created: result.count });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error },
        { status: 400 }
      );
    }
    console.error("POST /api/books/:id/editorial/findings error:", error);
    return NextResponse.json(
      { error: "Failed to create findings" },
      { status: 500 }
    );
  }
}
