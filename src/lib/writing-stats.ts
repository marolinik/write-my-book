import { db } from "@/lib/db";

// NOTE: all day-bucketing is UTC by design (`toISOString().split("T")[0]`).
// Every call site (writing-stats API, book overview, dashboard, wrapped)
// buckets the same way — do not mix local-time bucketing into individual
// call sites. A future per-user timezone fix must change all of them atomically.

export interface DailyWordCount {
  /** UTC day key, YYYY-MM-DD */
  date: string;
  words: number;
}

export interface StreakStats {
  /** Consecutive days ending today (or yesterday, if today is empty) with words > 0 */
  currentStreak: number;
  /** Longest consecutive-date run with words > 0 in the period */
  bestStreak: number;
  /** Number of days in the period with words > 0 */
  activeDays: number;
}

export interface DailyWordCountsOptions {
  /** Scope to a single book (mutually exclusive with userId) */
  bookId?: string;
  /** Scope to all of a user's books (mutually exclusive with bookId) */
  userId?: string;
  /** Window size in days, ending today */
  days: number;
}

/**
 * Compute daily word counts from DocumentVersion records.
 *
 * We look at CHAPTER_CONTENT document versions and compute the word count
 * diff between consecutive versions, attributing each delta to the UTC day
 * the version was created. The first in-window version of each document is
 * diffed against its latest PRE-window version (fetched separately as a
 * one-row-per-document baseline), not against 0 — so opening the window
 * never inflates a day by a chapter's entire prior word count. A document
 * with no pre-window version still attributes its first version's full
 * word count to its creation date.
 *
 * Bounded by design: the main query fetches only in-window rows; the
 * baseline adds at most one row per document. Autosave creates a version
 * every ~2s of typing, so full-history scans grow without bound.
 */
export async function getDailyWordCounts(
  opts: DailyWordCountsOptions
): Promise<DailyWordCount[]> {
  const { bookId, userId, days } = opts;
  if ((bookId && userId) || (!bookId && !userId)) {
    throw new Error(
      "getDailyWordCounts requires exactly one of bookId or userId"
    );
  }

  // Initialize all days in range so the output is zero-filled. Built first
  // so the window start derives from the same UTC day keys (no boundary drift).
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    dailyMap.set(key, 0);
  }
  const oldestKey = [...dailyMap.keys()].sort()[0];
  const windowStart = new Date(`${oldestKey}T00:00:00.000Z`);

  const versions = await db.documentVersion.findMany({
    where: {
      createdAt: { gte: windowStart },
      document: {
        type: "CHAPTER_CONTENT",
        ...(bookId ? { bookId } : {}),
        ...(userId ? { book: { userId } } : {}),
      },
    },
    select: {
      documentId: true,
      version: true,
      wordCount: true,
      createdAt: true,
    },
    orderBy: [{ documentId: "asc" }, { version: "asc" }],
  });

  // Baseline: latest pre-window version per document with in-window activity,
  // so the first in-window delta diffs against the true predecessor.
  const docIds = [...new Set(versions.map((v) => v.documentId))];
  const baselineAgg = docIds.length
    ? await db.documentVersion.groupBy({
        by: ["documentId"],
        where: { documentId: { in: docIds }, createdAt: { lt: windowStart } },
        _max: { version: true },
      })
    : [];
  const baselineRows = baselineAgg.length
    ? await db.documentVersion.findMany({
        where: {
          OR: baselineAgg.map((b) => ({
            documentId: b.documentId,
            version: b._max.version!,
          })),
        },
        select: { documentId: true, wordCount: true },
      })
    : [];
  const baselineByDoc = new Map(
    baselineRows.map((r) => [r.documentId, r.wordCount])
  );

  // Group by document to compute deltas
  const byDoc = new Map<string, typeof versions>();
  for (const v of versions) {
    const existing = byDoc.get(v.documentId) ?? [];
    existing.push(v);
    byDoc.set(v.documentId, existing);
  }

  for (const [docId, docVersions] of byDoc) {
    for (let i = 0; i < docVersions.length; i++) {
      const v = docVersions[i];
      const prevWordCount =
        i > 0
          ? docVersions[i - 1].wordCount
          : (baselineByDoc.get(docId) ?? 0);
      const delta = Math.max(0, v.wordCount - prevWordCount);
      const dateKey = v.createdAt.toISOString().split("T")[0];

      if (dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + delta);
      }
    }
  }

  // Convert to sorted array (oldest first)
  return Array.from(dailyMap.entries())
    .map(([date, words]) => ({ date, words }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Returns the UTC day key immediately after the given YYYY-MM-DD key. */
function nextUtcDay(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

/**
 * Compute the current writing streak: consecutive days (ending today or
 * yesterday) with at least 1 word written.
 */
function computeCurrentStreak(
  dailyCounts: ReadonlyArray<DailyWordCount>
): number {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Work backwards from most recent
  const sorted = [...dailyCounts].sort((a, b) => b.date.localeCompare(a.date));

  let streak = 0;
  let expectedDate = today;

  for (const entry of sorted) {
    if (entry.date === expectedDate) {
      if (entry.words > 0) {
        streak++;
        // Move expected date back one day
        const d = new Date(expectedDate);
        d.setDate(d.getDate() - 1);
        expectedDate = d.toISOString().split("T")[0];
      } else {
        // If today has 0 words, allow starting from yesterday
        if (entry.date === today) {
          expectedDate = yesterday;
          continue;
        }
        break;
      }
    } else if (entry.date < expectedDate) {
      // Skip if we missed a day (streak broken), unless it's because
      // today hasn't started yet and we're looking at yesterday
      if (streak === 0 && entry.date === yesterday && entry.words > 0) {
        streak++;
        const d = new Date(yesterday);
        d.setDate(d.getDate() - 1);
        expectedDate = d.toISOString().split("T")[0];
      } else {
        break;
      }
    }
  }

  return streak;
}

/**
 * Compute streak statistics over a set of daily word counts.
 */
export function computeStreaks(
  dailyCounts: ReadonlyArray<DailyWordCount>
): StreakStats {
  const currentStreak = computeCurrentStreak(dailyCounts);

  // Best streak: longest consecutive-date run with words > 0 (forward scan)
  const sorted = [...dailyCounts].sort((a, b) => a.date.localeCompare(b.date));
  let bestStreak = 0;
  let run = 0;
  let prevActiveDate: string | null = null;

  for (const entry of sorted) {
    if (entry.words > 0) {
      run =
        prevActiveDate !== null && entry.date === nextUtcDay(prevActiveDate)
          ? run + 1
          : 1;
      bestStreak = Math.max(bestStreak, run);
      prevActiveDate = entry.date;
    } else {
      run = 0;
      prevActiveDate = null;
    }
  }

  const activeDays = dailyCounts.filter((d) => d.words > 0).length;

  return { currentStreak, bestStreak, activeDays };
}

/** Words written today (UTC day key lookup). */
export function getTodayWords(
  dailyCounts: ReadonlyArray<DailyWordCount>
): number {
  const today = new Date().toISOString().split("T")[0];
  return dailyCounts.find((d) => d.date === today)?.words ?? 0;
}
