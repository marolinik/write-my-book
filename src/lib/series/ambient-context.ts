// src/lib/series/ambient-context.ts
import type { StyleMetrics } from "@/lib/series/chapter-metrics";

export interface PriorCharacter {
  bookNumber: number;
  name: string;
  aliases: string[];
  role: string | null;
  status: string | null;
  lastMentioned: number | null;
  description: string | null;
}

export interface PriorThread {
  bookNumber: number;
  name: string;
  status: string;
  relatedNames: string[];
}

export interface AmbientContextInput {
  currentBookNumber: number;
  onStageNames: string[];
  priorBookCharacters: PriorCharacter[];
  openThreads: PriorThread[];
  currentStyleMetrics: StyleMetrics | null;
  seriesBaselineMetrics: StyleMetrics | null;
  baselineBookNumber: number | null;
}

export interface AmbientCharacterView {
  name: string;
  matchedFrom: string | null;
  lastBook: number;
  lastChapter: number | null;
  role: string | null;
  status: string | null;
  description: string | null;
  aliases: string[];
}

export interface AmbientThreadView {
  name: string;
  fromBook: number;
  status: string;
  relatedNames: string[];
}

export interface ToneMetricView {
  key: string;
  current: number;
  baseline: number;
  deltaPct: number;
  material: boolean;
}

export interface AmbientContextView {
  characters: AmbientCharacterView[];
  threads: AmbientThreadView[];
  toneDrift: { baselineBook: number; metrics: ToneMetricView[] } | null;
  notReady: boolean;
}

// 25% (not 20) so LLM-estimate-vs-exact-count noise is less likely to cross it (review fix).
export const MATERIALITY_PCT = 25;

/** Lowercase, strip diacritics, collapse whitespace. Total on any input. */
function normalize(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function aliasSet(c: PriorCharacter): Set<string> {
  const names = [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])];
  return new Set(names.map(normalize).filter((n) => n.length > 0));
}

/** Latest book wins; tie broken by higher lastMentioned. */
function isLater(a: PriorCharacter, b: PriorCharacter): boolean {
  if (a.bookNumber !== b.bookNumber) return a.bookNumber > b.bookNumber;
  return (a.lastMentioned ?? 0) > (b.lastMentioned ?? 0);
}

/**
 * Viewing-relative deixis that goes STALE when a prior-book character description is
 * surfaced while writing a LATER book (F13). Ordered longest-phrase-first so a
 * compound ("one month prior to this chapter") is consumed before its parts.
 */
const CROSS_BOOK_DEIXIS: readonly RegExp[] = [
  // "one month prior to this chapter", "three days before this book", "2 years ago"
  /\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:day|week|month|year|chapter)s?\s+(?:prior to|before|ago|earlier)(?:\s+(?:this|the current|the previous)\s+(?:chapter|book))?/gi,
  // "prior to / before / as of / in / during / by / since / after  this|the current  chapter|book"
  /\b(?:prior to|before|as of|in|during|by|since|after)\s+(?:this|the current)\s+(?:chapter|book)\b/gi,
  // bare "this chapter", "the current book", …
  /\b(?:this|the current)\s+(?:chapter|book)\b/gi,
  // "last chapter", "the previous chapter", "the next chapter"
  /\b(?:the\s+)?(?:last|previous|next)\s+chapter\b/gi,
  // viewing-relative adverbs
  /\b(?:recently|currently|presently|right now|at present|as of now|for now|nowadays)\b/gi,
];

/**
 * Strip viewing-relative deixis from a cross-book description and tidy the result.
 * Total on any input; returns null when nothing substantive remains (F13). We cannot
 * recover the true story-time delta from the graph, so the honest minimum is to
 * remove the false relative anchor rather than assert a new (also-wrong) one.
 */
function neutralizeCrossBookDeixis(description: string | null): string | null {
  if (description == null) return null;
  let out = description;
  for (const re of CROSS_BOOK_DEIXIS) out = out.replace(re, " ");
  out = out
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")          // space before punctuation
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")    // collapse repeated separators
    .replace(/\(\s*\)/g, "")                    // empty parens left by a removal
    .replace(/^[\s,;:.–—-]+/, "")     // leading punctuation/space
    .replace(/[\s,;:–—-]+$/, "")      // trailing separators (keep a sentence period)
    .trim();
  return out.length > 0 ? out : null;
}

function matchCharacters(
  onStageNames: string[],
  prior: PriorCharacter[]
): AmbientCharacterView[] {
  const out: AmbientCharacterView[] = [];
  for (const token of onStageNames) {
    const norm = normalize(token);
    if (norm.length === 0) continue;
    let best: PriorCharacter | null = null;
    for (const c of prior) {
      if (aliasSet(c).has(norm)) {
        if (best === null || isLater(c, best)) best = c;
      }
    }
    if (best === null) continue;
    if (out.some((v) => v.name === best!.name && v.lastBook === best!.bookNumber)) continue;
    out.push({
      name: best.name,
      matchedFrom: normalize(best.name) === norm ? null : token,
      lastBook: best.bookNumber,
      lastChapter: best.lastMentioned,
      role: best.role,
      status: best.status,
      description: best.description,
      aliases: Array.isArray(best.aliases) ? best.aliases : [],
    });
  }
  return out;
}

function filterThreads(
  threads: PriorThread[],
  onStageNorm: Set<string>
): AmbientThreadView[] {
  const out: AmbientThreadView[] = [];
  for (const t of threads) {
    if (t.status === "resolved" || t.status === "abandoned") continue;
    const related = Array.isArray(t.relatedNames) ? t.relatedNames : [];
    if (related.some((n) => onStageNorm.has(normalize(n)))) {
      out.push({ name: t.name, fromBook: t.bookNumber, status: t.status, relatedNames: related });
    }
  }
  return out;
}

function toneDrift(
  current: StyleMetrics | null,
  baseline: StyleMetrics | null,
  baselineBook: number | null
): AmbientContextView["toneDrift"] {
  if (!current || !baseline || baselineBook == null) return null;
  // dialogueRatio is deliberately excluded: the baseline measures dialogue VOLUME
  // (LLM estimate) while computeChapterMetrics measures a sentence-COUNT fraction —
  // the two are not comparable, so a delta between them is fake insight (review fix).
  const keys: (keyof StyleMetrics)[] = [
    "avgWordsPerSentence",
    "avgSentencesPerParagraph",
  ];
  const metrics: ToneMetricView[] = [];
  for (const key of keys) {
    const b = baseline[key];
    const c = current[key];
    if (typeof b !== "number" || typeof c !== "number" || b <= 0) continue;
    const deltaPct = Math.round(((c - b) / b) * 100);
    metrics.push({ key, current: c, baseline: b, deltaPct, material: Math.abs(deltaPct) >= MATERIALITY_PCT });
  }
  return { baselineBook, metrics };
}

export function buildAmbientContext(input: AmbientContextInput): AmbientContextView {
  const onStage = (input.onStageNames ?? []).filter((n) => normalize(n).length > 0);
  // D-25/F4 latest-book-wins: the CURRENT book is itself a recency candidate, so a
  // carried-over character surfaces their freshest series state (isLater picks it),
  // not a frozen prior-book snapshot. `<=` keeps the current book in and still bars
  // any future book. (The route also feeds the current book's own states in alongside
  // the prior books' — this filter is the last-line guard.)
  const series = (input.priorBookCharacters ?? []).filter((c) => c.bookNumber <= input.currentBookNumber);
  // F13: neutralize viewing-relative deixis ONLY on records carried from an EARLIER
  // book (where "this chapter" no longer means what it meant when authored). A record
  // whose latest state IS the current book is left in-frame, untouched.
  const characters = matchCharacters(onStage, series).map((v) =>
    v.lastBook < input.currentBookNumber
      ? { ...v, description: neutralizeCrossBookDeixis(v.description) }
      : v
  );

  // DEVIATION FROM PLAN (implementer note, see report): the plan built
  // onStageNorm from the raw onStageNames tokens only. That fails the
  // "matches a thread via an on-stage character's alias" test — when the
  // on-stage token is an alias (e.g. "the Captain"), a thread's
  // relatedNames referencing the canonical name ("Milan") would never
  // intersect. Expanding the set with each matched character's canonical
  // name and aliases fixes this without changing any other behavior
  // (raw tokens are still included so unmatched on-stage names, e.g. a
  // character with no prior-book record, still correctly fail to match).
  const onStageNorm = new Set(onStage.map(normalize));
  for (const c of characters) {
    onStageNorm.add(normalize(c.name));
    for (const a of c.aliases) onStageNorm.add(normalize(a));
  }

  return {
    characters,
    threads: filterThreads(input.openThreads ?? [], onStageNorm),
    toneDrift: toneDrift(input.currentStyleMetrics, input.seriesBaselineMetrics, input.baselineBookNumber),
    notReady: onStage.length === 0,
  };
}
