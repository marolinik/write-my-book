/**
 * #18: Story Radar — the alert types actually implemented.
 *
 * The radar only runs two word-count heuristics today:
 *   - "pacing"    — chapters that are outliers in length vs the book average
 *   - "structure" — chapters left unchanged for a long time (staleness)
 *
 * It does NOT do continuity, character, or style analysis (that needs the
 * Neo4j story-graph wire-up, which is roadmap). This module is the single
 * source of truth for the advertised-vs-emitted set so the UI copy and the
 * route can never drift apart.
 */

export const RADAR_ALERT_TYPES = ["pacing", "structure"] as const;
export type RadarAlertType = (typeof RADAR_ALERT_TYPES)[number];

export interface RadarChapterInput {
  chapterNumber: number;
  status: string;
  updatedAt: Date | string;
  wordCount: number;
}

export interface RadarAlert {
  id: string;
  type: RadarAlertType;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  chapterNumber?: number;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const STALE_DAYS = 30;

/**
 * Pure alert builder. Emits only the two implemented heuristics — every alert
 * carries a `type` from {@link RADAR_ALERT_TYPES}.
 *
 * `locale` is a BCP-47 tag (from `localeFor(preferredLanguage)`) used to format
 * the word counts embedded in `detail`, so the numbers don't leak the server
 * locale. Defaults to "en-US".
 */
export function buildRadarAlerts(
  chapters: readonly RadarChapterInput[],
  now: number,
  locale: string = "en-US"
): RadarAlert[] {
  const alerts: RadarAlert[] = [];

  const avgWords =
    chapters.length > 0
      ? chapters.reduce((s, c) => s + c.wordCount, 0) / chapters.length
      : 0;

  // Pacing: chapter length outliers vs the book average.
  for (const ch of chapters) {
    if (avgWords > 0 && ch.wordCount < avgWords * 0.3 && ch.wordCount > 0) {
      alerts.push({
        id: `short-${ch.chapterNumber}`,
        type: "pacing",
        severity: "info",
        title: `Ch.${ch.chapterNumber} is unusually short`,
        detail: `${ch.wordCount.toLocaleString(locale)} words vs ${Math.round(
          avgWords
        ).toLocaleString(locale)} average`,
        chapterNumber: ch.chapterNumber,
      });
    }

    if (avgWords > 0 && ch.wordCount > avgWords * 2.5) {
      alerts.push({
        id: `long-${ch.chapterNumber}`,
        type: "pacing",
        severity: "info",
        title: `Ch.${ch.chapterNumber} is unusually long`,
        detail: `${ch.wordCount.toLocaleString(locale)} words — consider splitting`,
        chapterNumber: ch.chapterNumber,
      });
    }
  }

  // Structure: chapters stuck in the same status for a long time.
  for (const ch of chapters) {
    const daysSinceUpdate = Math.floor(
      (now - new Date(ch.updatedAt).getTime()) / DAY_MS
    );
    if (daysSinceUpdate > STALE_DAYS && ch.status !== "beta_passed") {
      alerts.push({
        id: `stale-${ch.chapterNumber}`,
        type: "structure",
        severity: "warning",
        title: `Ch.${ch.chapterNumber} unchanged for ${daysSinceUpdate} days`,
        detail: `Status: ${ch.status.replace(/_/g, " ")}`,
        chapterNumber: ch.chapterNumber,
      });
    }
  }

  return alerts;
}
