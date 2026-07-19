import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getChapterExtractionFacts,
  MAX_EMPTY_EXTRACTION_ATTEMPTS,
  MAX_FAILED_EXTRACTION_ATTEMPTS,
  FAILED_BACKOFF_MS,
} from "@/lib/graph/graph-maintenance";
import { shouldExtract } from "@/lib/continuity/continuity-flags";
import {
  deriveExtractionStatus,
  type ExtractionStatusView,
} from "@/lib/continuity/extraction-status";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// Mirrors the scan route's throttle window so the read-only "next retry"
// indicator agrees with when a scan would actually re-trigger extraction.
const EXTRACT_MIN_INTERVAL_MS = 90_000;
const GRAPH_TIMEOUT_MS = 5000;

const chapterQuerySchema = z.object({ chapterNumber: z.coerce.number().int().positive() });
const flagIdSchema = z.object({ flagId: z.string().min(1) });

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("graph timeout")), ms)),
  ]);
}

interface ContinuityFlagResponse {
  id: string;
  signature: string;
  type: string;
  severity: string;
  description: string;
  entities: string[];
  chapterNumber: number;
  jumpChapter: number | null;
  anchor: string | null;
}

/** Entities are stored as a JSON string; parse defensively back to string[]. */
function parseEntities(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/books/[id]/continuity — READ-ONLY continuity surface (RC-4 fix 5c).
 *
 * Lists the book's currently-active continuity flags WITHOUT running a scan, so
 * a client can poll continuity state without triggering a billed extraction (the
 * old code offered no read path: the only way to see flags was POST /scan, which
 * kicks off extraction). With `?chapterNumber=`, it also returns the honest
 * extraction state for that chapter (pending / extracting-ish / failed / checked
 * + billing-cap + throttle indicator) derived purely from the graph facts.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await db.continuityFlag.findMany({
      where: { bookId, status: "active" },
      select: {
        id: true, signature: true, type: true, severity: true, description: true,
        entities: true, chapterNumber: true, jumpChapter: true, anchor: true,
      },
    });
    const flags: ContinuityFlagResponse[] = rows.map((r) => ({
      id: r.id,
      signature: r.signature,
      type: r.type,
      severity: r.severity,
      description: r.description,
      entities: parseEntities(r.entities),
      chapterNumber: r.chapterNumber,
      jumpChapter: r.jumpChapter,
      anchor: r.anchor,
    }));

    // Optional per-chapter extraction status (read-only; never extracts/bills).
    let extraction: ExtractionStatusView | null = null;
    const chParsed = chapterQuerySchema.safeParse({
      chapterNumber: new URL(request.url).searchParams.get("chapterNumber"),
    });
    if (chParsed.success) {
      try {
        const now = new Date();
        const facts = await withTimeout(
          getChapterExtractionFacts(bookId, chParsed.data.chapterNumber),
          GRAPH_TIMEOUT_MS
        );
        // GET never triggers extraction, so justTriggered is always false. Report
        // whether a scan WOULD currently be throttled so the "next retry" hint is
        // honest on the read-only surface too.
        const throttled = facts.updatedAt
          ? !shouldExtract(facts.updatedAt, now, EXTRACT_MIN_INTERVAL_MS)
          : false;
        extraction = deriveExtractionStatus({
          facts,
          justTriggered: false,
          throttled,
          now,
          minIntervalMs: EXTRACT_MIN_INTERVAL_MS,
          maxAttempts: MAX_EMPTY_EXTRACTION_ATTEMPTS,
          maxFailedAttempts: MAX_FAILED_EXTRACTION_ATTEMPTS,
          failedBackoffMs: FAILED_BACKOFF_MS,
        });
      } catch (err) {
        console.error("[continuity-list] extraction status unavailable:", err);
      }
    }

    return NextResponse.json({ flags, extraction });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[continuity-list]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/books/[id]/continuity?flagId=… — DISMISS a flag (RC-4 fix 5c).
 *
 * Removes a single active flag now. Distinct from POST /intentional (which marks
 * a flag deliberate and permanently suppresses it): a dismiss is transient — if
 * the underlying contradiction still exists, the next scan re-detects and
 * re-creates it. Gives the writer a verb to clear the current surface without
 * asserting "this is intended forever".
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = flagIdSchema.safeParse({
      flagId: new URL(request.url).searchParams.get("flagId"),
    });
    if (!parsed.success) return NextResponse.json({ error: "flagId required" }, { status: 400 });

    // Fenced to the owned book; deleteMany count tells us whether it matched.
    const result = await db.continuityFlag.deleteMany({
      where: { id: parsed.data.flagId, bookId },
    });
    if (result.count === 0) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

    return NextResponse.json({ ok: true, dismissed: result.count });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[continuity-dismiss]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
