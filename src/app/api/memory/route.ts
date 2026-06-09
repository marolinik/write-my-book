import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSchema = z.object({
  category: z.enum(["style", "name", "preference", "constraint", "correction"]),
  content: z.string().min(1).max(1000),
  bookId: z.string().uuid().optional(),
});

/** GET /api/memory — list all active writer memories */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const bookId = req.nextUrl.searchParams.get("bookId") ?? undefined;

    const memories = await db.writerMemory.findMany({
      where: {
        userId: user.id,
        active: true,
        ...(bookId ? { OR: [{ bookId: null }, { bookId }] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(memories);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load memories" },
      { status: 500 }
    );
  }
}

/** POST /api/memory — add a new writer memory */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const data = createSchema.parse(body);

    const memory = await db.writerMemory.create({
      data: {
        userId: user.id,
        bookId: data.bookId ?? null,
        category: data.category,
        content: data.content,
        source: "user",
      },
    });

    return NextResponse.json(memory, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create memory" },
      { status: 500 }
    );
  }
}
