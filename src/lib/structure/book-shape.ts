/**
 * Dev editor v2, phase C — the whole book's shape, computed rather than read.
 *
 * The architect learns the book's pacing from one table: length against the
 * median, scenes, dialogue share, where each chapter starts on the book's
 * timeline, tension when an analysis exists, earlier hook ratings, and the
 * first and last lines of every chapter. It then reads in full only the few
 * chapters it means to move or cut. Pure: no database, no storage.
 */

import { computeChapterMetrics } from "@/lib/series/chapter-metrics";

/** A chapter this far above or below the median is flagged. */
const LONG_RATIO = 1.5;
const SHORT_RATIO = 0.5;
/** Enough to judge a hook; every word here is re-sent on each later turn. */
const EXCERPT_WORDS = 60;

const SCENE_BREAK = /^\s*(?:\*\s*\*\s*\*|-{3,}|_{3,}|◆|●|⁂|#)\s*$/;
/**
 * Dialogue in every convention the books use: quotation marks of any language,
 * corner brackets, and the dash that opens a line of dialogue in Russian,
 * Serbian, French or Spanish typesetting.
 */
const DIALOGUE_QUOTES = /["“”„«»「」『』‹›]/;
const DIALOGUE_DASH = /^\s*[—–―-]\s/;
const HEADING = /^\s*#{1,6}\s/;

export interface ChapterInput {
  id: string;
  chapterNumber: number;
  title: string | null;
  content: string;
}

export interface ChapterShape {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  words: number;
  scenes: number;
  /** Share of sentences carrying dialogue, 0..1; null for an empty chapter. */
  dialogueShare: number | null;
  meanSentenceWords: number | null;
  /** Where the chapter starts, as a percentage of the book's words. */
  startsAtPct: number;
  opening: string;
  closing: string;
  flags: Array<"long" | "short">;
}

export interface BookShape {
  chapters: ChapterShape[];
  totalWords: number;
  medianWords: number;
}

function proseLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").split("\n");
}

function wordsOf(text: string): string[] {
  const t = text.trim();
  return t.length === 0 ? [] : t.split(/\s+/);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function shapeOne(chapter: ChapterInput) {
  const lines = proseLines(chapter.content);
  const body = lines.filter((l) => !HEADING.test(l) && !SCENE_BREAK.test(l)).join("\n");
  const words = wordsOf(body);
  const breaks = lines.filter((l) => SCENE_BREAK.test(l) && !HEADING.test(l)).length;
  const metrics = computeChapterMetrics(body);
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  const dialogue = paragraphs.filter((p) => DIALOGUE_DASH.test(p) || DIALOGUE_QUOTES.test(p)).length;
  return {
    words: words.length,
    scenes: words.length === 0 ? 0 : breaks + 1,
    dialogueShare: paragraphs.length === 0 ? null : Math.round((dialogue / paragraphs.length) * 100) / 100,
    meanSentenceWords: metrics ? Math.round(metrics.avgWordsPerSentence * 10) / 10 : null,
    opening: words.slice(0, EXCERPT_WORDS).join(" "),
    closing: words.slice(-EXCERPT_WORDS).join(" "),
  };
}

export function computeBookShape(chapters: readonly ChapterInput[]): BookShape {
  const ordered = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const shaped = ordered.map((c) => ({ chapter: c, ...shapeOne(c) }));
  const totalWords = shaped.reduce((sum, c) => sum + c.words, 0);
  const medianWords = median(shaped.map((c) => c.words));

  let before = 0;
  const result: ChapterShape[] = shaped.map(({ chapter, ...s }) => {
    const startsAtPct = totalWords === 0 ? 0 : Math.round((before / totalWords) * 1000) / 10;
    before += s.words;
    const flags: ChapterShape["flags"] = [];
    if (medianWords > 0 && s.words > medianWords * LONG_RATIO) flags.push("long");
    if (medianWords > 0 && s.words > 0 && s.words < medianWords * SHORT_RATIO) flags.push("short");
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      ...s,
      startsAtPct,
      flags,
    };
  });
  return { chapters: result, totalWords, medianWords };
}

export interface HookRating {
  opening: number;
  ending: number;
}

/** The book map as the architect reads it: one table, then each chapter's edges. */
export function formatBookMap(
  shape: BookShape,
  extra: { tension?: ReadonlyMap<number, number>; hooks?: ReadonlyMap<number, HookRating> } = {}
): string {
  const rows = shape.chapters.map((c) => {
    const tension = extra.tension?.get(c.chapterNumber);
    const hook = extra.hooks?.get(c.chapterNumber);
    return [
      c.chapterNumber,
      c.title ?? "",
      c.words,
      c.flags.join(",") || "-",
      c.scenes,
      c.dialogueShare === null ? "-" : `${Math.round(c.dialogueShare * 100)}%`,
      c.meanSentenceWords ?? "-",
      `${c.startsAtPct}%`,
      tension ?? "-",
      hook ? `${hook.opening}/${hook.ending}` : "-",
    ].join(" | ");
  });

  const edges = shape.chapters.map(
    (c) =>
      `### ${c.chapterNumber}${c.title ? `. ${c.title}` : ""}\nOPENS: ${c.opening || "(empty)"}\nCLOSES: ${c.closing || "(empty)"}`
  );

  return [
    `${shape.chapters.length} chapters, ${shape.totalWords} words, median ${shape.medianWords} words per chapter.`,
    "",
    "| # | Title | Words | Flag | Scenes | Dialogue | Words/sentence | Starts at | Tension | Hooks open/end |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r} |`),
    "",
    "Tension comes from the manuscript analysis (0-10) when one exists. Hooks are earlier ratings (0 none, 1 soft, 2 question, 3 cliffhanger).",
    "",
    "## Chapter edges (first and last lines)",
    "",
    ...edges,
  ].join("\n");
}

/**
 * Dev editor v2, phase D — what a genre reader's expectations can be checked
 * against without a model: which chapters sit where the story's turns are
 * expected (as a share of the book's words), how many rated chapters end on a
 * hook, and the longest low-tension run through the middle. The architect maps
 * the actual beats from the architecture and the text; these are its anchors.
 */
const BEAT_WINDOWS = {
  inciting: [10, 15],
  firstTurn: [22, 28],
  midpoint: [47, 53],
  darkMoment: [72, 78],
  climax: [90, 100],
} as const;
const MIDDLE_FROM_PCT = 20;
const MIDDLE_TO_PCT = 75;
const MIN_SAG_CHAPTERS = 3;
const HOOKED_ENDING = 2;

export interface CommercialSignals {
  beats: Record<keyof typeof BEAT_WINDOWS, number[]>;
  hookedEndings: { rated: number; hooked: number };
  /** The longest run of middle chapters below the book's median tension; null without tension. */
  sag: { from: number; to: number } | null;
}

export function commercialSignals(
  shape: BookShape,
  extra: { tension?: ReadonlyMap<number, number>; hooks?: ReadonlyMap<number, HookRating> }
): CommercialSignals {
  const spans = shape.chapters.map((c) => ({
    n: c.chapterNumber,
    start: c.startsAtPct,
    end: shape.totalWords === 0 ? c.startsAtPct : c.startsAtPct + (c.words / shape.totalWords) * 100,
  }));
  const within = ([lo, hi]: readonly [number, number]) =>
    spans.filter((s) => s.start < hi && s.end > lo).map((s) => s.n);
  const beats = Object.fromEntries(
    Object.entries(BEAT_WINDOWS).map(([k, win]) => [k, within(win)])
  ) as CommercialSignals["beats"];

  const ratings = [...(extra.hooks?.values() ?? [])];
  const hookedEndings = { rated: ratings.length, hooked: ratings.filter((r) => r.ending >= HOOKED_ENDING).length };

  let sag: CommercialSignals["sag"] = null;
  const tension = extra.tension;
  if (tension && tension.size > 0) {
    const values = [...tension.values()].sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    let run: number[] = [];
    let best: number[] = [];
    for (const c of shape.chapters) {
      const inMiddle = c.startsAtPct >= MIDDLE_FROM_PCT && c.startsAtPct < MIDDLE_TO_PCT;
      const t = tension.get(c.chapterNumber);
      if (inMiddle && t !== undefined && t < median) {
        run = [...run, c.chapterNumber];
        if (run.length > best.length) best = run;
      } else {
        run = [];
      }
    }
    if (best.length >= MIN_SAG_CHAPTERS) sag = { from: best[0], to: best[best.length - 1] };
  }
  return { beats, hookedEndings, sag };
}

export function formatCommercialSignals(s: CommercialSignals): string {
  const list = (ns: number[]) => (ns.length ? ns.join(", ") : "-");
  return [
    "## COMMERCIAL READING (computed anchors, not verdicts)",
    `- Inciting incident expected by about 12% of the book: chapter(s) ${list(s.beats.inciting)}.`,
    `- First turn, about 25%: chapter(s) ${list(s.beats.firstTurn)}.`,
    `- Midpoint, about 50%: chapter(s) ${list(s.beats.midpoint)}.`,
    `- Dark moment, about 75%: chapter(s) ${list(s.beats.darkMoment)}.`,
    `- Climax, last 10%: chapter(s) ${list(s.beats.climax)}.`,
    s.hookedEndings.rated > 0
      ? `- Chapters ending on a hook (rated 2-3): ${s.hookedEndings.hooked} of ${s.hookedEndings.rated} rated.`
      : "- No hook ratings yet: rate the endings with RateHooks before judging the page-turn.",
    s.sag
      ? `- Sagging middle: chapters ${s.sag.from}-${s.sag.to} run below the book's median tension.`
      : "- No sag computed (no tension from an analysis, or no long low run): judge the middle from lengths, dialogue and the edges.",
  ].join("\n");
}
