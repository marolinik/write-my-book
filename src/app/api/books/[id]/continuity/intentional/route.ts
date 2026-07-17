import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseJsonBody } from "@/lib/api/parse-json-body";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };
const bodySchema = z.object({ flagId: z.string().min(1) });

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = bodySchema.safeParse(await parseJsonBody(request).catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "flagId required" }, { status: 400 });

    // Fenced to the owned book; updateMany count tells us if it matched.
    const result = await db.continuityFlag.updateMany({
      where: { id: parsed.data.flagId, bookId },
      data: { status: "intentional" },
    });
    if (result.count === 0) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[continuity-intentional]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
