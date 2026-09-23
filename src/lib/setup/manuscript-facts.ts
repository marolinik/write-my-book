/**
 * What the manuscript already says, read before the setup conversation.
 *
 * A writer who pasted chapter 1 and clicked "Set up with chat" was still
 * asked for genre, premise and protagonist, and for a 200-word sample, while
 * the chapters sat in the book. The facts of the text are read first and
 * handed to the conversation as settled; what the judge is unsure of stays a
 * question.
 *
 * Measured over 13 books: tense read as past at 0.95-1.00 everywhere. Point of
 * view read third-person limited at 0.72-0.99, except two trilogy books whose
 * openings mix registers, at 0.33-0.66: those are asked. Genre is a label the
 * writer chooses, so it is only ever proposed. A single choice cannot say
 * "historical thriller" (it picks one half), and per-genre yes/no tagged
 * nearly everything "literary".
 */

/** Less than this and there is no voice or register to read. */
export const MIN_OPENING_CHARS = 1500;
/** Enough of the opening to hear point of view, tense and genre. */
const OPENING_CHARS = 8000;

const POV = {
  first: "First person: the narrator is a character and says I.",
  second: "Second person: the reader is addressed as you.",
  "third-limited": "Third person limited: he/she, staying inside one character's view per scene.",
  "third-omniscient":
    "Third person omniscient: he/she, a narrator who knows many minds and more than any character.",
} as const;

const TENSE = {
  past: "Narrated in the past tense.",
  present: "Narrated in the present tense.",
} as const;

const GENRE = {
  literary: "Literary fiction: character and language first, plot secondary.",
  thriller: "Thriller or suspense: danger, pursuit, a threat that escalates.",
  mystery: "Mystery or crime: a crime or puzzle investigated and solved.",
  historical: "Historical fiction: set in a real past era, the period is central.",
  fantasy: "Fantasy: magic, invented worlds, mythical beings.",
  "science-fiction": "Science fiction: technology, the future, space, speculative science.",
  romance: "Romance: the love story is the main plot.",
  horror: "Horror: dread and the supernatural or monstrous.",
  "young-adult": "Young adult: teenage protagonist, coming of age.",
  nonfiction: "Memoir or nonfiction: real events told as true.",
} as const;

type Pov = keyof typeof POV;
type Tense = keyof typeof TENSE;
type Genre = keyof typeof GENRE;

export interface ManuscriptFacts {
  pov?: Pov;
  tense?: Tense;
  /** A proposal for the writer, never a decision. */
  genre?: Genre;
}

/** Point of view was clean at 0.72+ and genuinely mixed at 0.66 and below. */
const POV_SURE = 0.7;
/** Tense read 0.95+ on every book measured. */
const TENSE_SURE = 0.9;
/** Below this the top genre is one of several, and proposing it would steer. */
const GENRE_SURE = 0.7;

export function buildFactsRequest(opening: string): {
  state: Record<string, unknown>;
  questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, string> }>;
} {
  return {
    state: { manuscript_opening: opening.slice(0, OPENING_CHARS) },
    questions: {
      pov: {
        type: "choice",
        instructions: "Read `manuscript_opening`. From which point of view is the narrative told?",
        criteria: POV,
      },
      tense: {
        type: "choice",
        instructions: "Read `manuscript_opening`. In which tense is the narrative told (ignore dialogue)?",
        criteria: TENSE,
      },
      genre: {
        type: "choice",
        instructions: "Read `manuscript_opening`. Which genre is this book?",
        criteria: GENRE,
      },
    },
  };
}

function sure<T extends string>(answer: unknown, labels: Record<T, string>, floor: number): T | undefined {
  const a = answer as { type?: string; choice?: string; confidence?: number } | undefined;
  if (a?.type !== "choice" || typeof a.confidence !== "number" || !a.choice) return undefined;
  if (!(a.choice in labels) || a.confidence < floor) return undefined;
  return a.choice as T;
}

/** Only what the judge was sure of; everything else stays a question. */
export function readFacts(answers: Record<string, unknown>): ManuscriptFacts {
  const facts: ManuscriptFacts = {};
  const pov = sure<Pov>(answers.pov, POV, POV_SURE);
  const tense = sure<Tense>(answers.tense, TENSE, TENSE_SURE);
  const genre = sure<Genre>(answers.genre, GENRE, GENRE_SURE);
  if (pov) facts.pov = pov;
  if (tense) facts.tense = tense;
  if (genre) facts.genre = genre;
  return facts;
}

const POV_WORDS: Record<Pov, string> = {
  first: "first person",
  second: "second person",
  "third-limited": "third person, limited to one character per scene",
  "third-omniscient": "third person, omniscient",
};

/** The block the setup conversation receives, or null when nothing is settled. */
export function factsSection(facts: ManuscriptFacts): string | null {
  if (!facts.pov && !facts.tense && !facts.genre) return null;
  const settled: string[] = [];
  if (facts.pov) settled.push(`- Point of view: ${POV_WORDS[facts.pov]}.`);
  if (facts.tense) settled.push(`- Tense: ${facts.tense} tense.`);
  const open: string[] = [];
  if (!facts.pov) open.push("point of view");
  if (!facts.tense) open.push("tense");

  return [
    "",
    "<established_by_the_manuscript>",
    "The writer's chapters already exist and were read before this conversation.",
    ...(settled.length
      ? ["The text settles these. Do not ask the writer about them; use them:", ...settled]
      : []),
    ...(facts.genre
      ? [
          `Genre is the writer's label, not a fact of the text: propose "${facts.genre}" for them to confirm or correct.`,
        ]
      : []),
    ...(open.length
      ? [`Not settled by the text: ${open.join(" and ")}. Ask about ${open.length > 1 ? "them" : "it"} if the story depends on it.`]
      : []),
    "Do not ask for a writing sample: the chapters are the sample.",
    "</established_by_the_manuscript>",
  ].join("\n");
}
