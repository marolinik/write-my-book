import { db } from "@/lib/db";
import { getBookStorage } from "@/lib/storage";

/**
 * Parsed shape of the ANALYSIS_REPORT document.
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
 * stable shape. Returns `hasReport:false` when no report exists or it carries
 * no readability scores. Safe, owner-agnostic data — reused by the same-auth
 * snapshot page and later by the account-less share payload if needed.
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

    return fromJson(content) ?? fromMarkdown(content) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}

/** A report stored as JSON (the shape this reader was first written for). */
function fromJson(content: string): AnalysisReportStats | null {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const readability = data.readability ?? {};
  return {
    readability: {
      fleschKincaid: numberOr(readability.fleschKincaid),
      gunningFog: numberOr(readability.gunningFog),
      colemanLiau: numberOr(readability.colemanLiau),
      genreBenchmark: readability.genreBenchmark ?? null,
    },
    pacing: Array.isArray(data.pacing) ? data.pacing : [],
    dialogue: Array.isArray(data.dialogue) ? data.dialogue : [],
    overuse: Array.isArray(data.overuse) ? data.overuse : [],
    hasReport: true,
  };
}

/**
 * P4-S23: the report the agents actually write. Both producers ('analyze' and
 * 'read-manuscript') are told to write Markdown, and the analyze prompt asks
 * for a "Readability scores table (one row per formula, columns: Formula |
 * Score | Grade Level | Interpretation)". JSON.parse threw on every real
 * report, so readability never reached a share link or the snapshot.
 *
 * The scores are read from any table row that names a formula, whatever the
 * heading above it says or which language it is in. A report with no scores
 * is not a report for these consumers: zeros would be a claim, not a gap.
 */
function fromMarkdown(content: string): AnalysisReportStats | null {
  const scores: Partial<Record<GradeFormula, number>> = {};
  for (const line of content.split("\n")) {
    const cells = tableCells(line);
    if (!cells || cells.length < 2) continue;
    const formula = formulaOf(cells[0]);
    if (!formula || scores[formula] !== undefined) continue;
    const score = numberIn(cells[1]);
    if (score === null || score < GRADE_MIN || score > GRADE_MAX) continue;
    scores[formula] = score;
  }
  if (Object.keys(scores).length === 0) return null;
  return {
    ...EMPTY,
    readability: {
      fleschKincaid: scores.fleschKincaid ?? 0,
      gunningFog: scores.gunningFog ?? 0,
      colemanLiau: scores.colemanLiau ?? 0,
      genreBenchmark: null,
    },
    hasReport: true,
  };
}

type GradeFormula = "fleschKincaid" | "gunningFog" | "colemanLiau";

/**
 * The three formulas all report a school grade, so a score outside this band
 * is some other number in the row (a Reading Ease score runs 0-100).
 */
const GRADE_MIN = -5;
const GRADE_MAX = 30;

/** "Reading Ease" is a different Flesch formula; its row must never be read as the grade. */
const READING_EASE = /ease|lako[cć]|facilit|lesbar|leicht|л[её]гк|易/i;

function formulaOf(label: string): GradeFormula | null {
  const l = label.toLowerCase();
  if (l.includes("gunning") || /\bfog\b/.test(l)) return "gunningFog";
  if (l.includes("coleman") || l.includes("liau")) return "colemanLiau";
  if (l.includes("kincaid") && !READING_EASE.test(l)) return "fleschKincaid";
  return null;
}

/** The cells of a Markdown table row, or null for any other line. */
function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  return trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** The first number in a cell ("**7.84**", "~7.8", "6,9" with a decimal comma). */
function numberIn(cell: string): number | null {
  const match = cell.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = parseFloat(match[0].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function numberOr(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}