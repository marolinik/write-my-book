import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isValidShareToken, InMemoryRateLimiter, clientIpFrom } from "@/lib/share/token";
import { loadShareBook, loadShareEditorial } from "@/lib/share/snapshot-data";

/**
 * UDG round-7 (Luka 12): GET/DELETE /api/share/[token].
 *
 * GET is PUBLIC (no auth) — anyone with the token can load the snapshot payload.
 * Rate-limited per-IP in-memory. DELETE is owner-only (requireUser) and revokes
 * the link. The token is a random capability; the returned data is deliberately
 * small and contains no credentials (excluded in the loader).
 */
type RouteParams = { params: Promise<{ token: string }> };

// Per-process, fixed-window: 120 loads / 60s per IP. Docs note: resets on restart.
const publicLimiter = new InMemoryRateLimiter(60_000, 120);

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  if (!isValidShareToken(token)) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  if (!publicLimiter.allow(clientIpFrom(_req.headers))) {
    return NextResponse.json({ error: "Too many requests", retryAfterSec: 60 }, { status: 429 });
  }

  const snap = await db.sharedSnapshot.findUnique({ where: { token } });
  if (!snap || (snap.expiresAt && snap.expiresAt < new Date())) {
    return NextResponse.json({ error: "Share not found or expired" }, { status: 404 });
  }

  // Touch lastViewedAt best-effort.
  db.sharedSnapshot
    .update({ where: { token }, data: { lastViewedAt: new Date() } })
    .catch(() => undefined);

  try {
    const data =
      snap.kind === "editorial"
        ? await loadShareEditorial(snap.bookId, snap.createdById)
        : await loadShareBook(snap.bookId, snap.createdById);
    return NextResponse.json(data);
  } catch (err) {
    console.error("GET /api/share/[token] load error:", err);
    return NextResponse.json({ error: "Could not load snapshot" }, { status: 500 });
  }
}

/** DELETE /api/share/[token] — owner revokes a share link. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { token } = await params;
    if (!isValidShareToken(token)) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    const snap = await db.sharedSnapshot.findFirst({
      where: { token, createdById: user.id },
      select: { id: true },
    });
    if (!snap) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }
    await db.sharedSnapshot.delete({ where: { id: snap.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/share/[token] error:", error);
    return NextResponse.json({ error: "Failed to revoke share" }, { status: 500 });
  }
}