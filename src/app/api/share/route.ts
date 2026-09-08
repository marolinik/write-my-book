import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateShareToken } from "@/lib/share/token";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

/**
 * UDG round-7 (Luka 12): POST /api/share — an authenticated owner creates a
 * tokenized, account-less read-only link to one of their snapshots.
 *
 * Middleware exempts /api/share(.*) from auth.protect(), so the write path
 * self-enforces `requireUser()` (same as the rest of the API). The link can be
 * shared with anyone; opening it needs no account and exposes only this snapshot.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const bodyRaw = await parseJsonBody(req);
    const body = (bodyRaw ?? {}) as { bookId?: unknown; kind?: unknown; ttlDays?: unknown };
    const bookId = String(body.bookId ?? "");
    if (!bookId) {
      return NextResponse.json({ error: "bookId required" }, { status: 400 });
    }

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id }, select: { id: true } });
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const kind = body.kind === "editorial" ? "editorial" : "book";
    const ttlDays =
      Number(body.ttlDays) > 0 ? Math.min(Math.floor(Number(body.ttlDays)), 365) : null;

    const token = generateShareToken();
    const expiresAt = ttlDays ? new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000) : null;
    await db.sharedSnapshot.create({
      data: {
        token,
        bookId,
        kind,
        createdById: user.id,
        expiresAt,
      },
    });

    return NextResponse.json({
      url: `/share/${token}`,
      token,
      kind,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error("POST /api/share error:", error);
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}