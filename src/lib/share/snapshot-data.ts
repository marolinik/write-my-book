import { db } from "@/lib/db";
import { getAnalysisReport } from "@/lib/reports/analysis-report";
import { getDailyWordCounts, computeStreaks } from "@/lib/writing-stats";

/**
 * Safe, owner-agnostic snapshot payloads for the account-less share page.
 * Everything here is either author manuscript excerpts, AI suggestions, or
 * aggregate stats — never credentials. The creator's userId is still needed to
 * scope the S3 write-prefix reads (documents are stored under userId/bookId).
 */

export interface ShareBookData {
  kind: "book" | "editorial";
  bookName: string;
  bookGenre: string | null;
  bookStatusNote: string;
  series: string | null;
  wordCount: number;
  wordPct: number;
  chapters: { chapterNumber: number; title: string; status: string; betaScore: number | null }[];
  pctDrafted: number;
  pctPassed: number;
  healthScore: number | null;
  avgBetaScore: string | null;
  progress: number;
  findingsByChapter: { chapterNumber: number; findings: unknown[] }[];
  findingsTotal: number;
  analysisHasReport: boolean;
  readability: { fleschKincaid: number; gunningFog: number; colemanLiau: number } | null;
  generatedAt: Date;
  exportedBy: string | null;
}

/**
 * Load book snapshot data given the bookId. `createdById` is used for S3 read-scoping only.
 */
export async function loadShareBook(bookId: string, createdById: string): Promise<ShareBookData> {
  const book = await db.book.findFirst({
    where: { id: bookId },
    include: {
      chapters: {
        select: { id: true, chapterNumber: true, title: true, status: true, betaScore: true },
        orderBy: { chapterNumber: "asc" },
      },
      series: { select: { title: true } },
      healthSnapshot: { select: { overallScore: true } },
    },
  });
  if (!book) throw new Error("not-found");

  const totalChapters = book.chapters.length;
  const statusCounts: Record<string, number> = {};
  for (const ch of book.chapters) statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
  const draftedPlus =
    (statusCounts.drafted ?? 0) + (statusCounts.dev_edited ?? 0) + (statusCounts.line_edited ?? 0) + (statusCounts.beta_read ?? 0) + (statusCounts.beta_passed ?? 0);
  const betaPassedCount = statusCounts.beta_passed ?? 0;
  const pctDrafted = totalChapters > 0 ? Math.round((draftedPlus / totalChapters) * 100) : 0;
  const pctPassed = totalChapters > 0 ? Math.round((betaPassedCount / totalChapters) * 100) : 0;
  const wordPct =
    (book.targetWordCount ?? 0) > 0
      ? Math.min(Math.round(((book.wordCount ?? 0) / (book.targetWordCount ?? 1)) * 100), 100)
      : 0;

  const chaptersWithScores = book.chapters.filter((c) => c.betaScore != null);
  const avgBetaScore =
    chaptersWithScores.length > 0
      ? (chaptersWithScores.reduce((s, c) => s + (c.betaScore ?? 0), 0) / chaptersWithScores.length).toFixed(1)
      : null;

  const dailyCounts = await getDailyWordCounts({ bookId, days: 30 });
  const { currentStreak, bestStreak } = computeStreaks(dailyCounts);

  const analysis = await getAnalysisReport(createdById, bookId);

  return {
    kind: "book",
    bookName: book.name,
    bookGenre: book.genre,
    bookStatusNote: `${currentStreak > 0 ? `streak ${currentStreak} | ` : ""}best ${bestStreak} | drafted ${pctDrafted}% | beta ${pctPassed}%`,
    series: book.series?.title ?? null,
    wordCount: book.wordCount ?? 0,
    wordPct,
    chapters: book.chapters.map((c) => ({
      chapterNumber: c.chapterNumber,
      title: c.title ?? `Ch. ${c.chapterNumber}`,
      status: c.status,
      betaScore: c.betaScore,
    })),
    pctDrafted,
    pctPassed,
    healthScore: book.healthSnapshot?.overallScore ?? null,
    avgBetaScore,
    progress: 0,
    findingsByChapter: [],
    findingsTotal: 0,
    analysisHasReport: analysis.hasReport,
    readability: analysis.hasReport
      ? { fleschKincaid: analysis.readability.fleschKincaid, gunningFog: analysis.readability.gunningFog, colemanLiau: analysis.readability.colemanLiau }
      : null,
    generatedAt: new Date(),
    exportedBy: null,
  };
}

/** The editorial view reuses the book payload plus findings grouped by chapter. */
export type ShareEditorialData = ShareBookData;

export async function loadShareEditorial(bookId: string, createdById: string): Promise<ShareEditorialData> {
  const bookNameRow = await db.book.findFirst({ where: { id: bookId }, select: { name: true } });
  const findingsByChapterMap: Record<number, unknown[]> = {};
  let findingsTotal = 0;

  const findings = await db.editFinding.findMany({
    where: { bookId, status: "pending" },
    orderBy: [{ chapterNumber: "asc" }, { createdAt: "asc" }],
    select: {
      chapterNumber: true,
      severity: true,
      category: true,
      description: true,
      suggestion: true,
      anchorQuote: true,
      agentType: true,
    },
  });
  for (const f of findings) {
    findingsTotal++;
    (findingsByChapterMap[f.chapterNumber] ??= []).push({
      severity: f.severity,
      category: f.category,
      description: f.description,
      suggestion: f.suggestion,
    });
  }

  return {
    ...(await loadShareBook(bookId, createdById)),
    kind: "editorial",
    bookName: bookNameRow?.name ?? "Book",
    findingsByChapter: Object.entries(findingsByChapterMap).map(([num, arr]) => ({
      chapterNumber: Number(num),
      findings: arr,
    })),
    findingsTotal: findingsTotal,
  };
}