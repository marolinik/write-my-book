/**
 * Which paragraphs look like stock prose, and are worth a second look?
 *
 * A-23 gave the agents a list of calques to avoid in each language, which is
 * guidance for writing, not a measurement of what was written. The line
 * editor's AI-tell check hunts for phrases, and a phrase list is always a list
 * of yesterday's tells in one language.
 *
 * This asks one question per paragraph that can be checked by reading it: how
 * much of it is images any story would use, feelings named instead of shown,
 * neat quotable closers, atmosphere that could sit in any book?
 *
 * It deliberately does NOT ask who wrote the paragraph. That question was
 * tried first and failed on held-out chapters: it caught 2 of 12 paragraphs
 * DeepSeek wrote and flagged 6 of 125 of the owner's. The owner's verdict on
 * those six was that they read as stock even where they are his, so they
 * deserve a check. A note here says "look at this", never "a machine wrote
 * this", and the writer decides.
 *
 * The request shape is part of the contract. Eighteen questions over one long
 * state drifted with position: the same paragraph scored 0.71 first in the
 * list and 2.87 last. Six per request, sent in parallel, held within 0.3.
 */

/**
 * The spectrum, bottom to top. Each level names what is on the page, because
 * the position between two of them becomes the number.
 */
export const STOCK_PROSE_LEVELS = [
  "None: every image and line is particular to this story and these people.",
  "One stock touch in otherwise particular prose.",
  "Several stock touches: a familiar image, a named feeling, a tidy closer.",
  "Mostly stock: generic atmosphere, feelings explained, lines that sound quotable rather than true.",
  "Almost entirely stock: could be lifted into any book of its genre unchanged.",
] as const;

/** Measured, not chosen: more than this and position starts to decide. */
export const PASSAGES_PER_REQUEST = 6;

/** A paragraph shorter than this carries too little to judge. */
export const MIN_PASSAGE_CHARS = 200;

/**
 * At or above this, on 0-10, AND at or above the confidence floor, a paragraph
 * is worth a check. High scores the judge is unsure of were where the writer's
 * own particular prose landed, so confidence is half the rule.
 */
const FLAG_THRESHOLD = 5.5;
const MIN_CONFIDENCE = 0.45;

export interface Passage {
  /** 1-indexed over every non-empty block, the numbering CreateFinding uses. */
  paragraphNumber: number;
  text: string;
}

export interface StockProseJudgement extends Passage {
  /** 0-10, normalised from the level spectrum. */
  score: number;
  confidence: number;
}

export interface StockProseRequest {
  passages: Passage[];
  state: Record<string, unknown>;
  questions: Record<string, { type: string; instructions: string; criteria: unknown }>;
}

/** The paragraphs worth judging, numbered the way the rest of the product numbers them. */
export function splitPassages(chapter: string): Passage[] {
  return chapter
    .split(/\n\n+/)
    .filter((block) => block.trim().length > 0)
    .map((block, i) => ({ paragraphNumber: i + 1, text: block.trim() }))
    .filter((p) => !p.text.startsWith("#") && p.text.length >= MIN_PASSAGE_CHARS);
}

/** One request per six passages, each carrying only its own passages. */
export function buildStockProseRequests(passages: readonly Passage[]): StockProseRequest[] {
  const requests: StockProseRequest[] = [];
  for (let i = 0; i < passages.length; i += PASSAGES_PER_REQUEST) {
    requests.push(buildOne(passages.slice(i, i + PASSAGES_PER_REQUEST)));
  }
  return requests;
}

function buildOne(batch: Passage[]): StockProseRequest {
  const questions: StockProseRequest["questions"] = {};
  batch.forEach((_, index) => {
    questions[`p${index}`] = {
      type: "score",
      instructions: `Read the passage at \`passages[${index}]\`. How much of it is stock prose: images any story would use, feelings named instead of shown, neat aphoristic closing lines, atmosphere that could sit in any book?`,
      criteria: STOCK_PROSE_LEVELS,
    };
  });
  return { passages: batch, state: { passages: batch.map((p) => p.text) }, questions };
}

interface RawScore {
  type: "score";
  score: number;
  confidence: number;
}

/** Pair each passage with its answer; skip any that did not come back. */
export function readStockProseAnswers(
  answers: Record<string, unknown>,
  batch: readonly Passage[]
): StockProseJudgement[] {
  const top = STOCK_PROSE_LEVELS.length - 1;
  const judged: StockProseJudgement[] = [];
  batch.forEach((passage, index) => {
    const answer = answers[`p${index}`] as RawScore | undefined;
    if (answer?.type !== "score") return;
    const clamped = Math.min(Math.max(answer.score, 0), top);
    judged.push({ ...passage, score: (clamped / top) * 10, confidence: answer.confidence });
  });
  return judged;
}

/** Policy, in code and apart from the judgements: which paragraphs get a note. */
export function selectForCheck<T extends StockProseJudgement>(judged: readonly T[]): T[] {
  return judged.filter((j) => j.score >= FLAG_THRESHOLD && j.confidence >= MIN_CONFIDENCE);
}
