import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { wikiEntitySchema, wikiQuerySchema } from "@/lib/validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id: bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    select: { id: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  const { id: bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    select: { id: true },
  });
  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
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
}
