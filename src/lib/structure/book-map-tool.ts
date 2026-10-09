/**
 * Dev editor v2, phase C — the architect's two whole-book tools.
 *
 * BookMap: the book's shape in one call (see book-shape.ts), so the pass reads
 * in full only the few chapters it means to change. RateHooks: how each chapter
 * opens and ends, recorded per chapter so the writer's book map and the next
 * pass can see it.
 */

import { db } from "@/lib/db";
import { DocumentType } from "@/generated/prisma/enums";
import { getAnalysisReport } from "@/lib/reports/analysis-report";
import type { DocumentService } from "@/lib/documents/document-service";
import {
  commercialSignals,
  computeBookShape,
  formatBookMap,
  formatCommercialSignals,
  type HookRating,
} from "./book-shape";
import { passIdOf } from "./pass";

interface BookMapContext {
  bookId: string;
  userId: string;
  sessionId: string;
  documentService: Pick<DocumentService, "findByType" | "read">;
  /** The commercial pass (phase D) adds the genre reader's computed anchors. */
  commercial?: boolean;
}

export async function executeBookMap(ctx: BookMapContext): Promise<string> {
  const chapters = await db.chapter.findMany({
    where: { bookId: ctx.bookId },
    select: { id: true, chapterNumber: true, title: true },
    orderBy: { chapterNumber: "asc" },
  });
  if (chapters.length === 0) return "This book has no chapters yet.";

  const withText = await Promise.all(
    chapters.map(async (c) => {
      const doc = await ctx.documentService.findByType(DocumentType.CHAPTER_CONTENT, c.chapterNumber);
      const read = doc ? await ctx.documentService.read(doc.id) : null;
      return { ...c, content: read?.content ?? "" };
    })
  );

  const [report, ratings] = await Promise.all([
    getAnalysisReport(ctx.userId, ctx.bookId).catch(() => null),
    db.chapterHookRating.findMany({
      where: { bookId: ctx.bookId },
      select: { chapterId: true, opening: true, ending: true },
    }),
  ]);

  const numberById = new Map(chapters.map((c) => [c.id, c.chapterNumber]));
  const hooks = new Map<number, HookRating>();
  for (const r of ratings) {
    const n = numberById.get(r.chapterId);
    if (n !== undefined) hooks.set(n, { opening: r.opening, ending: r.ending });
  }
  const tension = new Map<number, number>(
    (report?.pacing ?? []).map((p: { chapter: number; tension: number }) => [p.chapter, p.tension])
  );

  const shape = computeBookShape(withText);
  const map = formatBookMap(shape, { tension, hooks });
  return ctx.commercial
    ? `${map}\n\n${formatCommercialSignals(commercialSignals(shape, { tension, hooks }))}`
    : map;
}

const clampScore = (n: number) => Math.max(0, Math.min(3, Math.round(Number(n) || 0)));

type RatingInput = { chapterNumber: number; opening: number; ending: number; note?: string };
const MAX_NOTE_CHARS = 300;

export async function executeRateHooks(
  ctx: Pick<BookMapContext, "bookId" | "sessionId">,
  input: { ratings?: RatingInput[] | string }
): Promise<string> {
  // A local model sends the array as a JSON string often enough (live, run 3).
  let ratings: RatingInput[] = [];
  if (typeof input.ratings === "string") {
    try {
      const parsed = JSON.parse(input.ratings);
      ratings = Array.isArray(parsed) ? parsed : [];
    } catch {
      return "Nothing recorded: ratings must be a list of {chapterNumber, opening, ending}.";
    }
  } else if (Array.isArray(input.ratings)) {
    ratings = input.ratings;
  }
  if (ratings.length === 0) return "Nothing recorded: pass a list with one rating per chapter you judged.";

  const chapters = await db.chapter.findMany({
    where: { bookId: ctx.bookId },
    select: { id: true, chapterNumber: true },
  });
  const idByNumber = new Map(chapters.map((c) => [c.chapterNumber, c.id]));
  const sessionId = passIdOf(ctx.sessionId);

  const unknown: number[] = [];
  let skipped = 0;
  let recorded = 0;
  for (const r of ratings) {
    // A rating without both scores would overwrite a good earlier one with 0.
    if (!r || !Number.isFinite(Number(r.opening)) || !Number.isFinite(Number(r.ending))) {
      skipped++;
      continue;
    }
    const chapterId = idByNumber.get(Number(r.chapterNumber));
    if (!chapterId) {
      unknown.push(r.chapterNumber);
      continue;
    }
    const data = {
      opening: clampScore(r.opening),
      ending: clampScore(r.ending),
      note: typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, MAX_NOTE_CHARS) : null,
      sessionId,
    };
    await db.chapterHookRating.upsert({
      where: { chapterId },
      create: { bookId: ctx.bookId, chapterId, ...data },
      update: data,
    });
    recorded++;
  }
  return (
    `Recorded hook ratings for ${recorded} chapter(s).` +
    (unknown.length ? ` Skipped chapters that do not exist: ${unknown.join(", ")}.` : "") +
    (skipped ? ` Skipped ${skipped} rating(s) without both an opening and an ending score.` : "")
  );
}
