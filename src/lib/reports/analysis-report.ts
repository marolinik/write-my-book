import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";

/**
 * Parsed shape of the ANALYSIS_REPORT document (the manuscript-analyst's JSON).
 * Mirrors what `src/components/reports/analytics-tab.tsx` consumes.
 */
export interface AnalysisReportStats {
  readability: {
    fleschKincaid: number;
    gunningFog: number;
    colemanLiau: number;
    genreBenchmark: { fk: { min: number; max: number } } | null;
  };
  pacing: { chapter: number; tension: number; genreAvg?: number | null }[];
  dialogue: { character: string; lineCount: number; avgLength: number; percentage: number }[];
  overuse: { word: string; count: number; expected: number; ratio: number }[];
  hasReport: boolean;
}

const EMPTY: AnalysisReportStats = {
  readability: { fleschKincaid: 0, gunningFog: 0, colemanLiau: 0, genreBenchmark: null },
  pacing: [],
  dialogue: [],
  overuse: [],
  hasReport: false,
};

/**
 * Read + parse the book's most recent ANALYSIS_REPORT (S3, book-scoped) into a
 * stable shape. Returns `hasReport:false` when no report exists or it isn't JSON.
 * Safe, owner-agnostic data — reused by the same-auth snapshot page and later by
 * the account-less share payload if needed.
 */
export async function getAnalysisReport(
  userId: string,
  bookId: string
): Promise<AnalysisReportStats> {
  try {
    const doc = await db.document.findFirst({
      where: { bookId, type: "ANALYSIS_REPORT" },
      orderBy: { updatedAt: "desc" },
      select: { storageKey: true },
    });
    if (!doc?.storageKey) return EMPTY;

    const content = await getBookStorage(userId, bookId).read(doc.storageKey);
    if (!content) return EMPTY;

    const data = JSON.parse(content);
    const readability = data?.readability ?? {};
    return {
      readability: {
        fleschKincaid: numberOr(readability.fleschKincaid),
        gunningFog: numberOr(readability.gunningFog),
        colemanLiau: numberOr(readability.colemanLiau),
        genreBenchmark: readability.genreBenchmark ?? null,
      },
      pacing: Array.isArray(data?.pacing) ? data.pacing : [],
      dialogue: Array.isArray(data?.dialogue) ? data.dialogue : [],
      overuse: Array.isArray(data?.overuse) ? data.overuse : [],
      hasReport: true,
    };
  } catch {
    return EMPTY;
  }
}

function numberOr(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}