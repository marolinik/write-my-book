import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createSeriesSchema } from "@/lib/validation";
import { checkPlanAccess } from "@/lib/billing/plan-gating";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

/** GET /api/series — list all series for the current user. */
export async function GET() {
  try {
    const user = await requireUser();

    const series = await db.series.findMany({
      where: { userId: user.id },
      include: {
        books: {
          orderBy: { bookNumber: "asc" },
          select: { id: true, bookNumber: true, name: true, status: true, wordCount: true },
        },
        _count: { select: { books: true, documents: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(series);
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series error:", error);
    return NextResponse.json(
      { error: "Failed to fetch series" },
      { status: 500 }
    );
  }
}

/** POST /api/series — create a new series. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // Plan-gating: series requires Professional plan or higher
    const access = await checkPlanAccess(user.id, "create_series");
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason, upgradeToTier: access.upgradeToTier },
        { status: 403 }
      );
    }

    const body = await parseJsonBody(req);
    const data = createSeriesSchema.parse(body);

    const series = await db.series.create({
      data: {
        userId: user.id,
        title: data.title,
        genre: data.genre ?? null,
        language: data.language ?? "en",
        seriesType: data.seriesType ?? "TRILOGY",
        plannedBooks: data.plannedBooks ?? 3,
        description: data.description ?? null,
      },
    });

    return NextResponse.json(series, { status: 201 });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((error as Error).name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: error }, { status: 400 });
    }
    console.error("POST /api/series error:", error);
    return NextResponse.json(
      { error: "Failed to create series" },
      { status: 500 }
    );
  }
}
