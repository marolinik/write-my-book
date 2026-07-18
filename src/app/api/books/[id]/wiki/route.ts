import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { wikiEntitySchema, wikiQuerySchema } from "@/lib/validation";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const sp = Object.fromEntries(req.nextUrl.searchParams);
    const query = wikiQuerySchema.parse(sp);

    const where: Record<string, unknown> = { bookId };
    if (query.type !== "all") {
      where.type = query.type;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const entities = await db.wikiEntity.findMany({
      where,
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(entities);
  } catch (error) {
    // D-15: previously no top-level catch — a Zod failure raw-500'd with an
    // empty body. Standard envelope, matching the chapters-route pattern.
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("GET /api/books/:id/wiki error:", error);
    return NextResponse.json(
      { error: "Failed to fetch wiki entities" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // D-01 guard: malformed body answers 400, not a raw 500.
    let body: unknown;
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      const invalidJson = invalidJsonBodyResponse(error);
      if (invalidJson) return invalidJson;
      throw error;
    }
    const data = wikiEntitySchema.parse(body);

    const { attributes, ...rest } = data;
    const entity = await db.wikiEntity.create({
      data: {
        ...rest,
        bookId,
        attributes: attributes as Record<string, string | number | boolean>,
      },
    });

    return NextResponse.json(entity, { status: 201 });
  } catch (error) {
    // D-15: previously no top-level catch — a Zod failure raw-500'd with an
    // empty body. Standard envelope, matching the chapters-route pattern.
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("POST /api/books/:id/wiki error:", error);
    return NextResponse.json(
      { error: "Failed to create wiki entity" },
      { status: 500 }
    );
  }
}
