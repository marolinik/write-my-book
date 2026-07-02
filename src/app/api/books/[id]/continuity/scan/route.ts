import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { runConsistencyChecks, getChapterNodeUpdatedAt } from "@/lib/graph/graph-queries";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { toContinuityFlags, shouldExtract } from "@/lib/continuity/continuity-flags";
import { planFlagSync, type ExistingFlag } from "@/lib/continuity/flag-sync";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };
const querySchema = z.object({ chapterNumber: z.coerce.number().int().positive() });

const EXTRACT_MIN_INTERVAL_MS = 90_000;
const GRAPH_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("graph timeout")), ms)),
  ]);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const parsed = querySchema.safeParse({
      chapterNumber: new URL(request.url).searchParams.get("chapterNumber"),
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid chapterNumber" }, { status: 400 });
    const chapterNumber = parsed.data.chapterNumber;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ── Throttled graph refresh (best-effort; failure never 500s). ──
    try {
      const lastExtracted = await withTimeout(getChapterNodeUpdatedAt(bookId, chapterNumber), GRAPH_TIMEOUT_MS);
      if (shouldExtract(lastExtracted, new Date(), EXTRACT_MIN_INTERVAL_MS)) {
        const svc = new DocumentService(user.id, bookId);
        const doc = await svc.findByType(DocumentType.CHAPTER_CONTENT, chapterNumber);
        if (doc) {
          const content = (await svc.readPinned(doc.id))?.content ?? "";
          await updateFromChapter(bookId, chapterNumber, content);
        }
      }
    } catch (err) {
      console.error("[continuity-scan] extraction skipped:", err);
    }

    // ── Detect (pure Cypher, book-wide). On failure: empty, delete NOTHING. ──
    let issues;
    try {
      issues = await withTimeout(runConsistencyChecks(bookId), GRAPH_TIMEOUT_MS);
    } catch (err) {
      console.error("[continuity-scan] check failed:", err);
      return NextResponse.json({ flags: [] });
    }

    // ── Load existing flags (active for the diff; intentional for the filter). ──
    const rows = await db.continuityFlag.findMany({
      where: { bookId },
      select: { id: true, signature: true, status: true },
    });
    const intentionalSignatures = new Set(rows.filter((r) => r.status === "intentional").map((r) => r.signature));
    const existing: ExistingFlag[] = rows.filter((r) => r.status === "active").map((r) => ({ id: r.id, signature: r.signature }));

    const detected = toContinuityFlags({ issues, intentionalSignatures });
    const { toCreate, toDelete } = planFlagSync({ detected, existing });

    // DEVIATION FROM PLAN: the plan re-queries `db.continuityFlag.findMany`
    // here to build the response. That re-query is redundant with data we
    // already hold (`detected`, `existing`, and the upsert results) and —
    // per the pinned unit test's mock shape — a single `findMany` mock
    // cannot distinguish the "load existing/intentional" call from a second
    // "load active for response" call, so the plan's literal transcription
    // returns stale/empty data. Building the response from in-memory state
    // is presentation-only: it does not change `planFlagSync`'s decisions,
    // the delete-only-on-success path, book-wide symmetric sync, or the
    // timeout wrapping.
    const idBySignature = new Map<string, string>(existing.map((e) => [e.signature, e.id]));
    for (const f of toCreate) {
      const upserted = await db.continuityFlag.upsert({
        where: { bookId_signature: { bookId, signature: f.signature } },
        create: {
          bookId,
          chapterNumber: f.chapterNumber,
          signature: f.signature,
          type: f.type,
          severity: f.severity,
          description: f.description,
          entities: JSON.stringify(f.entities),
          anchor: f.anchor,
          jumpChapter: f.jumpChapter,
          status: "active",
        },
        update: {}, // already active with this signature → no-op
      });
      idBySignature.set(f.signature, upserted.id);
    }
    if (toDelete.length > 0) {
      await db.continuityFlag.deleteMany({ where: { id: { in: toDelete }, bookId } });
    }

    // ── Return all ACTIVE flags with their ids (client needs id for [Intentional]). ──
    const flags = detected.map((f) => ({
      id: idBySignature.get(f.signature) as string,
      signature: f.signature,
      type: f.type,
      severity: f.severity,
      description: f.description,
      entities: f.entities,
      chapterNumber: f.chapterNumber,
      jumpChapter: f.jumpChapter,
      anchor: f.anchor,
    }));

    return NextResponse.json({ flags });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[continuity-scan]", error);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
