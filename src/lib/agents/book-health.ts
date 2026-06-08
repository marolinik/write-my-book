/**
 * Book Health computation engine.
 * Calculates health scores based on chapters, documents, findings, and insights.
 */

import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────

export interface ChapterHealthEntry {
  chapterNumber: number;
  status: string;
  score: number; // 0-100
  isStale: boolean;
  staleSince?: Date;
  issues: string[];
}

export interface HealthAlert {
  type:
    | "stale_chapter"
    | "health_drop"
    | "missing_setup"
    | "stuck_chapter"
    | "orphan_findings";
  severity: "info" | "warning" | "critical";
  message: string;
  chapterNumber?: number;
  actionWorkflow?: string;
}

export interface BookHealthResult {
  overallScore: number;
  structureScore: number;
  consistencyScore: number;
  proseScore: number;
  completenessScore: number;
  chapterHealth: ChapterHealthEntry[];
  staleChapters: number[];
  alerts: HealthAlert[];
  activeIssues: number;
}

// ─── Status Scoring ─────────────────────────────────────────────

const STATUS_SCORE: Record<string, number> = {
  undiscussed: 10,
  discussed: 20,
  planned: 30,
  drafted: 50,
  dev_edited: 65,
  line_edited: 80,
  beta_read: 90,
  beta_passed: 100,
};

// ─── Main Computation ───────────────────────────────────────────

/** Compute health scores for a book based on current state. */
export async function computeBookHealth(
  bookId: string
): Promise<BookHealthResult> {
  // Gather all necessary data in parallel
  const [
    chapters,
    documents,
    findings,
    insights,
    staleChapters,
  ] = await Promise.all([
    db.chapter.findMany({
      where: { bookId },
      orderBy: { chapterNumber: "asc" },
    }),
    db.document.findMany({
      where: { bookId },
      select: { type: true, chapterNumber: true },
    }),
    db.editFinding.findMany({
      where: { bookId, status: "pending" },
      select: { chapterNumber: true, severity: true },
    }),
    db.bookInsight.findMany({
      where: { bookId, status: "active" },
      select: { insightType: true, domain: true },
    }),
    detectStaleChapters(bookId),
  ]);

  const docTypes = new Set(documents.map((d) => d.type));
  const staleSet = new Set(staleChapters);

  // Build per-chapter health
  const findingsByChapter = new Map<number, typeof findings>();
  for (const f of findings) {
    const arr = findingsByChapter.get(f.chapterNumber) ?? [];
    arr.push(f);
    findingsByChapter.set(f.chapterNumber, arr);
  }

  const chapterHealth: ChapterHealthEntry[] = chapters.map((ch) => {
    const baseScore = STATUS_SCORE[ch.status] ?? 10;
    const chFindings = findingsByChapter.get(ch.chapterNumber) ?? [];
    const issues: string[] = [];

    let penalty = 0;
    for (const f of chFindings) {
      if (f.severity === "critical") {
        penalty += 15;
        issues.push(`Critical finding pending`);
      } else if (f.severity === "major") {
        penalty += 10;
        issues.push(`Major finding pending`);
      }
    }

    const isStale = staleSet.has(ch.chapterNumber);
    if (isStale) {
      penalty += 20;
      issues.push("Chapter is stale (upstream changes detected)");
    }

    const score = Math.max(0, Math.min(100, baseScore - penalty));

    return {
      chapterNumber: ch.chapterNumber,
      status: ch.status,
      score,
      isStale,
      staleSince: isStale ? new Date() : undefined,
      issues,
    };
  });

  // ─── Scoring Rubrics ─────────────────────────────────────────

  // Structure (25%): has architecture (+30), has story bible (+30), chapter count > 0 (+20), all chapters have plans (+20)
  let structureScore = 0;
  if (docTypes.has("ARCHITECTURE")) structureScore += 30;
  if (docTypes.has("STORY_BIBLE")) structureScore += 30;
  if (chapters.length > 0) structureScore += 20;
  if (
    chapters.length > 0 &&
    chapters.every(
      (ch) =>
        STATUS_SCORE[ch.status] !== undefined &&
        STATUS_SCORE[ch.status]! >= STATUS_SCORE["planned"]!
    )
  ) {
    structureScore += 20;
  }

  // Consistency (25%): no critical continuity findings (+40), no active WARNING insights (+30), no stale chapters (+30)
  let consistencyScore = 0;
  const criticalContinuity = findings.filter(
    (f) => f.severity === "critical"
  ).length;
  if (criticalContinuity === 0) consistencyScore += 40;
  const activeWarnings = insights.filter(
    (i) => i.insightType === "WARNING"
  ).length;
  if (activeWarnings === 0) consistencyScore += 30;
  if (staleChapters.length === 0) consistencyScore += 30;

  // Prose (25%): average beta score * 10 (+50), no critical line-edit findings (+25), has fingerprint (+25)
  let proseScore = 0;
  const betaChapters = chapters.filter((ch) => ch.betaScore !== null);
  if (betaChapters.length > 0) {
    const avgBeta =
      betaChapters.reduce((sum, ch) => sum + (ch.betaScore ?? 0), 0) /
      betaChapters.length;
    proseScore += Math.min(50, Math.round(avgBeta * 10));
  }
  // No critical line-edit findings still pending
  const criticalLineEdit = findings.filter(
    (f) => f.severity === "critical"
  ).length;
  if (criticalLineEdit === 0) proseScore += 25;
  if (docTypes.has("FINGERPRINT")) proseScore += 25;

  // Completeness (25%): (chapters with status >= drafted / total chapters) * 100
  let completenessScore = 0;
  if (chapters.length > 0) {
    const draftedOrBetter = chapters.filter(
      (ch) =>
        STATUS_SCORE[ch.status] !== undefined &&
        STATUS_SCORE[ch.status]! >= STATUS_SCORE["drafted"]!
    ).length;
    completenessScore = Math.round(
      (draftedOrBetter / chapters.length) * 100
    );
  }

  // Overall: weighted average
  const overallScore = Math.round(
    structureScore * 0.25 +
      consistencyScore * 0.25 +
      proseScore * 0.25 +
      completenessScore * 0.25
  );

  const activeIssues = findings.length;

  // Build book state for alert generation
  const bookState = {
    hasStoryBible: docTypes.has("STORY_BIBLE"),
    hasArchitecture: docTypes.has("ARCHITECTURE"),
    hasFingerprint: docTypes.has("FINGERPRINT"),
  };

  const healthWithoutAlerts = {
    overallScore,
    structureScore,
    consistencyScore,
    proseScore,
    completenessScore,
    chapterHealth,
    staleChapters,
    activeIssues,
  };

  const alerts = generateAlerts(healthWithoutAlerts, bookState);

  return {
    ...healthWithoutAlerts,
    alerts,
  };
}

// ─── Snapshot Persistence ───────────────────────────────────────

/** Save health result to the database snapshot. */
export async function updateHealthSnapshot(
  bookId: string,
  health: BookHealthResult
): Promise<void> {
  await db.bookHealthSnapshot.upsert({
    where: { bookId },
    create: {
      bookId,
      overallScore: health.overallScore,
      structureScore: health.structureScore,
      consistencyScore: health.consistencyScore,
      proseScore: health.proseScore,
      completenessScore: health.completenessScore,
      chapterHealth: JSON.stringify(health.chapterHealth),
      activeIssues: health.activeIssues,
      staleChapters: health.staleChapters,
      alerts: JSON.stringify(health.alerts),
    },
    update: {
      overallScore: health.overallScore,
      structureScore: health.structureScore,
      consistencyScore: health.consistencyScore,
      proseScore: health.proseScore,
      completenessScore: health.completenessScore,
      chapterHealth: JSON.stringify(health.chapterHealth),
      activeIssues: health.activeIssues,
      staleChapters: health.staleChapters,
      alerts: JSON.stringify(health.alerts),
    },
  });
}

// ─── Staleness Detection ────────────────────────────────────────

/** Detect which chapters are stale based on pending change events. */
export async function detectStaleChapters(
  bookId: string
): Promise<number[]> {
  const unprocessedEvents = await db.documentChangeEvent.findMany({
    where: { bookId, processedAt: null },
    select: { documentType: true, chapterNumber: true },
  });

  if (unprocessedEvents.length === 0) return [];

  // Get all chapters to know which ones have content
  const chapters = await db.chapter.findMany({
    where: { bookId },
    select: { chapterNumber: true, status: true },
  });

  const staleSet = new Set<number>();

  for (const event of unprocessedEvents) {
    if (event.documentType === "STORY_BIBLE") {
      // All chapters with status >= drafted become stale
      for (const ch of chapters) {
        if (
          STATUS_SCORE[ch.status] !== undefined &&
          STATUS_SCORE[ch.status]! >= STATUS_SCORE["drafted"]!
        ) {
          staleSet.add(ch.chapterNumber);
        }
      }
    } else if (event.documentType === "ARCHITECTURE") {
      // All chapters with plans become stale
      for (const ch of chapters) {
        if (
          STATUS_SCORE[ch.status] !== undefined &&
          STATUS_SCORE[ch.status]! >= STATUS_SCORE["planned"]!
        ) {
          staleSet.add(ch.chapterNumber);
        }
      }
    } else if (
      event.documentType === "CHAPTER_CONTENT" &&
      event.chapterNumber != null
    ) {
      // Adjacent chapters need continuity re-check
      const n = event.chapterNumber;
      const allNumbers = chapters.map((ch) => ch.chapterNumber);
      if (allNumbers.includes(n - 1)) staleSet.add(n - 1);
      if (allNumbers.includes(n + 1)) staleSet.add(n + 1);
    }
    // FINGERPRINT updated: no stale marking (just recalculate prose scores)
  }

  return Array.from(staleSet).sort((a, b) => a - b);
}

// ─── Alert Generation ───────────────────────────────────────────

/** Generate alerts from health data. */
export function generateAlerts(
  health: Omit<BookHealthResult, "alerts">,
  bookState: {
    hasStoryBible: boolean;
    hasArchitecture: boolean;
    hasFingerprint: boolean;
  }
): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // Missing setup docs
  if (!bookState.hasStoryBible) {
    alerts.push({
      type: "missing_setup",
      severity: "warning",
      message: "Story Bible has not been created yet.",
      actionWorkflow: "create-story-bible",
    });
  }
  if (!bookState.hasArchitecture) {
    alerts.push({
      type: "missing_setup",
      severity: "warning",
      message: "Architecture document has not been created yet.",
      actionWorkflow: "build-architecture",
    });
  }
  if (!bookState.hasFingerprint) {
    alerts.push({
      type: "missing_setup",
      severity: "info",
      message: "Style fingerprint has not been captured yet.",
      actionWorkflow: "capture-style",
    });
  }

  // Stale chapters
  for (const chNum of health.staleChapters) {
    alerts.push({
      type: "stale_chapter",
      severity: "warning",
      message: `Chapter ${chNum} may be inconsistent with recent upstream changes.`,
      chapterNumber: chNum,
      actionWorkflow: "continuity-check",
    });
  }

  // Stuck chapters (score below 30 with pending findings)
  for (const ch of health.chapterHealth) {
    if (ch.score < 30 && ch.issues.length > 0) {
      alerts.push({
        type: "stuck_chapter",
        severity: "critical",
        message: `Chapter ${ch.chapterNumber} has a low health score (${ch.score}) with unresolved issues.`,
        chapterNumber: ch.chapterNumber,
        actionWorkflow: "discuss-edits",
      });
    }
  }

  // Orphan findings (active issues but no recent edit sessions)
  if (health.activeIssues > 20) {
    alerts.push({
      type: "orphan_findings",
      severity: "warning",
      message: `${health.activeIssues} pending findings need attention across the book.`,
      actionWorkflow: "discuss-edits",
    });
  }

  // Health drop (overall score low)
  if (health.overallScore < 40 && health.chapterHealth.length > 0) {
    alerts.push({
      type: "health_drop",
      severity: "critical",
      message: `Overall book health is critically low (${health.overallScore}/100).`,
    });
  }

  return alerts;
}
