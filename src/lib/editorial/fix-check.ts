/**
 * Did the fix fix it?
 *
 * The writer applies a finding and the product marks it done. Whether the
 * changed passage still has the problem the note named was never asked. On
 * the owner's book it mattered twice out of eight: chapter 31's continuity
 * "fix" pasted an editor's bracketed memo into the prose and left the gap
 * open, and chapter 1's point-of-view fix merged two sentences and kept the
 * boy as the perceiver. The judge put those at 0.76 and 0.63, the six fixes
 * that worked at 0.05-0.43, and the same eight left unchanged at 0.80-0.98.
 *
 * The probability is STORED, the verdict is policy: moving a threshold never
 * re-runs inference.
 */

export interface FixCheckInput {
  category: string;
  description: string;
  suggestion?: string | null;
  /** The passage the note was about. */
  before: string;
  /** The same passage after the writer's change. */
  after: string;
}

export function buildFixCheckRequest(input: FixCheckInput): {
  state: Record<string, unknown>;
  questions: { remains: { type: "noul"; instructions: string; criteria: { true: string; false: string } } };
} {
  return {
    state: {
      note: {
        category: input.category,
        complaint: input.description,
        suggestion: input.suggestion ?? null,
      },
      before: input.before,
      after: input.after,
    },
    questions: {
      remains: {
        type: "noul",
        instructions:
          "`note` is an editor's complaint about the passage `before`. The writer has since changed it to `after`. Does `after` still have the problem the note complains about?",
        criteria: {
          true: "The problem the note names is still there in `after`: the same weakness, contradiction or error, even if the wording moved.",
          false: "`after` no longer has the problem the note names.",
        },
      },
    },
  };
}

/** The probability the problem remains, or null when no answer came back. */
export function readFixCheck(answers: Record<string, unknown>): number | null {
  const answer = answers.remains as { type?: string; noul?: number } | undefined;
  if (answer?.type !== "noul" || typeof answer.noul !== "number") return null;
  return answer.noul;
}

function normalise(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** A passage that did not change still has its problem; no judge needed. */
export function unchangedPassage(before: string, after: string): boolean {
  return normalise(before) === normalise(after);
}

/** Measured gap: the fixes that worked topped out at 0.43, the two that did not started at 0.63. */
const HELD_BELOW = 0.5;
const NOT_HELD_FROM = 0.6;

export type FixVerdict = "held" | "not-held" | "unsure" | "unchecked";

export function fixVerdict(remains: number | null | undefined): FixVerdict {
  if (remains === null || remains === undefined) return "unchecked";
  if (remains < HELD_BELOW) return "held";
  if (remains >= NOT_HELD_FROM) return "not-held";
  return "unsure";
}

/**
 * Below this, the best window shares too little of the quote to be its
 * rewrite. Heavy but genuine rewrites on the measured data sat at 0.38; a
 * quote matched to an unrelated passage sat under 0.3.
 */
const MIN_REWRITE_SIMILARITY = 0.3;

export interface LocatedPassage {
  unchanged: boolean;
  text: string;
  similarity: number;
}

function words(text: string): string[] {
  return normalise(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function sentences(text: string): string[] {
  return text
    .split(/\n\n+/)
    .flatMap((p) => p.match(/[^.!?…]+[.!?…]+["'”»)]*|[^.!?…]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Shared words over total words, counting repeats: long windows earn nothing for length. */
function dice(a: readonly string[], b: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const w of a) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of b) {
    const c = counts.get(w) ?? 0;
    if (c > 0) {
      shared++;
      counts.set(w, c - 1);
    }
  }
  return (2 * shared) / (a.length + b.length || 1);
}

/**
 * What became of a quoted passage after the writer revised by hand.
 *
 * Measured on 14 hand-applied findings: whole-paragraph word overlap matched a
 * short quote to a long unrelated paragraph; a window of about as many
 * sentences as the quote, scored by Dice, found the rewrite every time.
 * Returns null rather than guess when nothing is close enough.
 */
export function locateRevisedPassage(quote: string, chapter: string): LocatedPassage | null {
  if (normalise(chapter).toLowerCase().includes(normalise(quote).toLowerCase())) {
    return { unchanged: true, text: quote, similarity: 1 };
  }
  const all = sentences(chapter);
  const size = Math.max(1, sentences(quote).length);
  const quoteWords = words(quote);

  let best: LocatedPassage | null = null;
  for (const width of [size - 1, size, size + 1]) {
    if (width < 1) continue;
    for (let i = 0; i + width <= all.length; i++) {
      const text = all.slice(i, i + width).join(" ");
      const similarity = dice(quoteWords, words(text));
      if (!best || similarity > best.similarity) best = { unchanged: false, text, similarity };
    }
  }
  return best && best.similarity >= MIN_REWRITE_SIMILARITY ? best : null;
}
