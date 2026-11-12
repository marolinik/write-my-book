/**
 * P2-51: the writing heatmap's grid in UTC only.
 *
 * The data is keyed by UTC date ("2026-11-12"); the grid used to step local
 * days and take the LOCAL weekday, so from 19:00 to midnight in New York (or
 * midnight to 02:00 in Berlin) every cell sat one row off and the server and
 * the browser built different grids (a daily hydration mismatch). Everything
 * here is Date.UTC arithmetic, so the same `today` gives the same grid
 * anywhere.
 */

export interface HeatmapCell {
  date: string;
  words: number;
  /** 0 = Sunday, in UTC. */
  dayOfWeek: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's UTC date as YYYY-MM-DD. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function buildHeatmapGrid(
  data: ReadonlyArray<{ date: string; words: number }>,
  today: string,
  days = 365
): HeatmapCell[][] {
  const words = new Map(data.map((d) => [d.date, d.words]));
  const [y, m, d] = today.split("-").map(Number);
  const end = Date.UTC(y, m - 1, d);

  const weeks: HeatmapCell[][] = [];
  let week: HeatmapCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = new Date(end - i * DAY_MS);
    const date = at.toISOString().slice(0, 10);
    const dayOfWeek = at.getUTCDay();
    if (dayOfWeek === 0 && week.length > 0) {
      weeks.push(week);
      week = [];
    }
    week.push({ date, words: words.get(date) ?? 0, dayOfWeek });
  }
  if (week.length > 0) weeks.push(week);
  return weeks;
}

/** The UTC month (0-11) of a YYYY-MM-DD date. */
export function utcMonthOf(date: string): number {
  return Number(date.slice(5, 7)) - 1;
}
