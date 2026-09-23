/**
 * Does this paragraph contradict the book's own canon?
 *
 * The live net is Cypher over the graph: on the owner's 28-chapter book it
 * held one active flag, and that one matched "officer" against "prime
 * minister". The deep check reads the whole book with Sonnet, 100k-400k tokens
 * a run, so it runs rarely. Between the two, a contradiction of the book's
 * canon could sit unseen for weeks.
 *
 * This asks, per paragraph, against the story bible. Measured on the owner's
 * book with facts flipped inside real paragraphs: rank, year, count and age
 * flips judged 0.63-0.95; the writer's prose and the unflipped originals at
 * most 0.35; on six held-out chapters, 0 of 101 real paragraphs at 0.5 or
 * more. It misses contradictions that must be inferred ("in Vienna" right
 * after "from Germany"); those stay with the deep check. Asking it to "state
 * or imply" did not recover them and raised an original to 0.39.
 *
 * A flagged paragraph is narrowed to its sentence, so the note points at the
 * line rather than at a block of prose.
 */

import { createHash } from "node:crypto";

/** Measured, not chosen: more questions per request and position starts to decide. */
export const PARAGRAPHS_PER_REQUEST = 6;

/**
 * Flipped facts started at 0.63. Over the owner's whole book (2462 paragraphs)
 * three paragraphs judged 0.51-0.56, and the owner ruled all three consistent
 * with the canon. 0.6 sits between what he rejected and what was planted.
 */
const CONTRADICTION_FROM = 0.6;

export interface CanonPassage {
  paragraphNumber: number;
  text: string;
}

export interface CanonJudgement extends CanonPassage {
  /** Probability the paragraph contradicts a fact the bible establishes. */
  contradiction: number;
}

type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
};

const CRITERIA = {
  true: "The passage states a fact that the story bible contradicts: a different name, rank, date, number, place, relationship or event than the one the bible establishes.",
  false:
    "Nothing in the passage contradicts the story bible. Details the bible does not cover, or covers differently in wording only, are not contradictions.",
};

export interface CanonRequest {
  passages: CanonPassage[];
  state: Record<string, unknown>;
  questions: Record<string, NoulQuestion>;
}

export function buildCanonRequests(
  passages: readonly CanonPassage[],
  storyBible: string
): CanonRequest[] {
  const requests: CanonRequest[] = [];
  for (let i = 0; i < passages.length; i += PARAGRAPHS_PER_REQUEST) {
    const batch = passages.slice(i, i + PARAGRAPHS_PER_REQUEST);
    const questions: Record<string, NoulQuestion> = {};
    batch.forEach((_, index) => {
      questions[`p${index}`] = {
        type: "noul",
        instructions: `Compare the passage at \`passages[${index}]\` with \`story_bible\`, the canon of this book. Does the passage state something that contradicts a fact the story bible establishes?`,
        criteria: CRITERIA,
      };
    });
    requests.push({
      passages: batch,
      state: { story_bible: storyBible, passages: batch.map((p) => p.text) },
      questions,
    });
  }
  return requests;
}

function noulOf(answer: unknown): number | null {
  const a = answer as { type?: string; noul?: number } | undefined;
  return a?.type === "noul" && typeof a.noul === "number" ? a.noul : null;
}

export function readCanonAnswers(
  answers: Record<string, unknown>,
  batch: readonly CanonPassage[]
): CanonJudgement[] {
  const judged: CanonJudgement[] = [];
  batch.forEach((passage, index) => {
    const p = noulOf(answers[`p${index}`]);
    if (p !== null) judged.push({ ...passage, contradiction: p });
  });
  return judged;
}

/** Policy, apart from the judgements. */
export function selectContradictions<T extends CanonJudgement>(judged: readonly T[]): T[] {
  return judged.filter((j) => j.contradiction >= CONTRADICTION_FROM);
}

/**
 * Sentences, without breaking on an ordinal's full stop ("1918. godine"): a
 * sentence ends only where the next one starts with a capital or a quote.
 */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…]["'”»)]*)\s+(?=[„"«(]?\p{Lu})/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildSentenceRequest(
  sentences: readonly string[],
  storyBible: string
): { state: Record<string, unknown>; questions: Record<string, NoulQuestion> } {
  const questions: Record<string, NoulQuestion> = {};
  sentences.forEach((_, index) => {
    questions[`s${index}`] = {
      type: "noul",
      instructions: `Compare the sentence at \`sentences[${index}]\` with \`story_bible\`, the canon of this book. Does it state something that contradicts a fact the story bible establishes?`,
      criteria: CRITERIA,
    };
  });
  return { state: { story_bible: storyBible, sentences: [...sentences] }, questions };
}

/** The sentence most likely to carry the contradiction, or null when none stands out. */
export function pickSentence(
  answers: Record<string, unknown>,
  sentences: readonly string[]
): string | null {
  let best: { sentence: string; p: number } | null = null;
  sentences.forEach((sentence, index) => {
    const p = noulOf(answers[`s${index}`]);
    if (p !== null && (!best || p > best.p)) best = { sentence, p };
  });
  const found = best as { sentence: string; p: number } | null;
  return found && found.p >= CONTRADICTION_FROM ? found.sentence : null;
}

/** A paragraph's identity for the check cache: same words, same hash. */
export function paragraphHash(text: string): string {
  return createHash("sha256")
    .update(text.normalize("NFC").replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 32);
}
