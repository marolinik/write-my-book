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

/** P1-27: a link lives this long unless the writer picks another lifetime. */
const DEFAULT_SHARE_TTL_DAYS = 30;

/**
 * Whole days, capped at a year. An explicit null or 0 is the dialog's "no
 * expiry"; a missing or unusable value is the default. P4-S10: a positive TTL
 * under a day is one day, never "no TTL".
 */
function resolveTtlDays(raw: unknown): number | null {
  if (raw === null || raw === 0) return null;
  const days = Number(raw);
  if (raw === undefined || !Number.isFinite(days) || days < 0) return DEFAULT_SHARE_TTL_DAYS;
  return Math.min(Math.max(Math.floor(days), 1), 365);
}

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
    const ttlDays = resolveTtlDays(body.ttlDays);

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

/**
 * P1-27: GET /api/share?bookId= — the writer's live links for one book, so
 * they can see what is out there and revoke it. Tokens are not returned: the
 * list shows their last four characters, and revocation goes by id.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const bookId = new URL(req.url).searchParams.get("bookId") ?? "";
    if (!bookId) {
      return NextResponse.json({ error: "bookId required", code: "INVALID_REQUEST" }, { status: 400 });
    }
    const rows = await db.sharedSnapshot.findMany({
      where: {
        bookId,
        createdById: user.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, kind: true, createdAt: true, expiresAt: true, lastViewedAt: true },
    });
    return NextResponse.json({
      links: rows.map((row) => ({
        id: row.id,
        tokenTail: row.token.slice(-4),
        kind: row.kind,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
        lastViewedAt: row.lastViewedAt ? row.lastViewedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/share error:", error);
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}

/** P1-27: DELETE /api/share?id= — the owner revokes one of their links. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) {
      return NextResponse.json({ error: "id required", code: "INVALID_REQUEST" }, { status: 400 });
    }
    const { count } = await db.sharedSnapshot.deleteMany({ where: { id, createdById: user.id } });
    if (count === 0) {
      return NextResponse.json({ error: "Share not found", code: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/share error:", error);
    return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  }
}
