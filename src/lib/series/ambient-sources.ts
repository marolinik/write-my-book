// src/lib/series/ambient-sources.ts
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents";
import { DocumentType } from "@/generated/prisma/enums";
import {
  getChapterEntities,
  getPlotThreads,
  getBookCharacterStates,
} from "@/lib/graph/graph-queries";
import { computeChapterMetrics, type StyleMetrics } from "@/lib/series/chapter-metrics";
import type { PriorCharacter, PriorThread } from "@/lib/series/ambient-context";
import type { StructuredFingerprint } from "@/lib/agents/types";

export type PriorBookRef = { id: string; bookNumber: number };

/** Characters on stage in the current chapter (by name). Throws on graph error. */
export async function getOnStageNames(
  bookId: string,
  chapterNumber: number
): Promise<string[]> {
  const entities = await getChapterEntities(bookId, chapterNumber);
  return entities.characters;
}

/** Full character state across all prior books; per-book failure isolated. */
export async function getPriorCharacters(
  priorBooks: PriorBookRef[]
): Promise<PriorCharacter[]> {
  const settled = await Promise.allSettled(
    priorBooks.map(async (b) => {
      const states = await getBookCharacterStates(b.id);
      return states.map((s) => ({
        bookNumber: b.bookNumber,
        name: s.name,
        aliases: s.aliases,
        role: s.role,
        status: s.status,
        lastMentioned: s.lastMentioned,
        description: s.description,
      }));
    })
  );
  // Per-book failure is isolated, but a TOTAL failure (every prior book errored)
  // is a real graph outage the route must see as graphOk=false — so rethrow it
  // instead of silently returning [] (review fix: allSettled never rejects, which
  // left the route's catch dead and produced a fake-empty panel on outage).
  if (priorBooks.length > 0 && settled.every((r) => r.status === "rejected")) {
    throw new Error("all prior-book character queries failed");
  }
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Unresolved plot threads across all prior books; per-book failure isolated. */
export async function getOpenThreads(
  priorBooks: PriorBookRef[]
): Promise<PriorThread[]> {
  const settled = await Promise.allSettled(
    priorBooks.map(async (b) => {
      const { threads } = await getPlotThreads(b.id);
      return threads
        .filter((t) => t.resolvedChapter == null && (t.status === "introduced" || t.status === "developing"))
        .map((t) => ({
          bookNumber: b.bookNumber,
          name: t.name,
          status: t.status,
          relatedNames: t.relatedCharacters,
        }));
    })
  );
  // Rethrow a total outage so the route sees graphOk=false (review fix — see getPriorCharacters).
  if (priorBooks.length > 0 && settled.every((r) => r.status === "rejected")) {
    throw new Error("all prior-book thread queries failed");
  }
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

function fingerprintToMetrics(fp: StructuredFingerprint | null | undefined): StyleMetrics | null {
  if (!fp || typeof fp !== "object") return null;
  const sentenceMean = fp.sentenceLength?.mean;
  const paragraphMean = fp.paragraphLength?.mean;
  const dialogue = fp.dialogueRatio;
  if (typeof sentenceMean !== "number" || typeof paragraphMean !== "number" || typeof dialogue !== "number") {
    return null;
  }
  return {
    avgWordsPerSentence: sentenceMean,
    dialogueRatio: dialogue,
    avgSentencesPerParagraph: paragraphMean,
  };
}

/** The series' author-style baseline: earliest calibrated StyleProfile in the series. */
export async function getStyleBaseline(
  userId: string,
  seriesBookIds: string[]
): Promise<{ metrics: StyleMetrics | null; baselineBookNumber: number | null }> {
  const profile = await db.styleProfile.findFirst({
    where: { userId, sourceBookId: { in: seriesBookIds } },
    orderBy: { sourceBookNumber: "asc" },
  });
  if (!profile) return { metrics: null, baselineBookNumber: null };
  return {
    metrics: fingerprintToMetrics(profile.metrics as unknown as StructuredFingerprint),
    baselineBookNumber: profile.sourceBookNumber ?? null,
  };
}

/** Objective metrics for the current chapter's stored content. */
export async function getCurrentChapterMetrics(
  userId: string,
  bookId: string,
  chapterNumber: number
): Promise<StyleMetrics | null> {
  const svc = new DocumentService(userId, bookId);
  const doc = await svc.findByType(DocumentType.CHAPTER_CONTENT, chapterNumber);
  if (!doc) return null;
  const result = await svc.readPinned(doc.id);
  const content = result?.content ?? "";
  return computeChapterMetrics(content);
}
