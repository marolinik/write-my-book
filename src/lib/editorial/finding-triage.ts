/**
 * Turning a wall of findings back into help.
 *
 * The owner's book carries 255 editorial findings, 165 of them pending, shown
 * in a list sorted by nothing a reader would care about. Severity is the
 * agent's own guess and most of everything is "important". A writer opening
 * that tab has no idea where to start, which is the single thing standing
 * between them and the product.
 *
 * Two questions per finding, over the chapter they all belong to, in small
 * requests of a few findings each:
 *
 *   impact   — how much would fixing this improve the chapter for a reader?
 *   conflict — does this ask the writer to undo something they already ruled out?
 *
 * The second question started life as "would this flatten the author's
 * voice", and on 13 real findings it answered between 0.35 and 0.62 every
 * time — genuine uncertainty, because nothing in the state let it decide.
 * The product already stores the answerable version: WriterMemory rows where
 * the writer has said, in their own words, "keep the seal and the brass ruler
 * as two separate objects; never link them". A note that asks for the
 * opposite is checkable, and nothing acted on those rules at triage time.
 *
 * Both answers are STORED, never applied. Ranking, thresholds and what the
 * panel shows are code and user controls, so changing a weight or a filter
 * never re-runs inference. The raw judgements stay reusable.
 */

/**
 * The impact spectrum, bottom to top. Each level names something a reader
 * would notice, because a level like "medium" tells the model nothing and the
 * position between two of them is what becomes the number.
 */
export const IMPACT_LEVELS = [
  "Fixing this changes nothing a reader would ever notice. It is a matter of taste between two acceptable choices.",
  "Fixing this tidies a sentence. The reader would not have stumbled, but the line reads a little better afterwards.",
  "Fixing this removes a small snag: a repeated word, a muddy image, a beat that lands slightly late. The reader felt it without naming it.",
  "Fixing this repairs something the reader would notice and mind: a confusing passage, a dead stretch, a character sounding wrong.",
  "Fixing this repairs something that breaks the chapter: a contradiction, a missing beat the story depends on, a moment that loses the reader entirely.",
] as const;

/**
 * Measured, not chosen. The same 13 findings sent forwards and reversed moved
 * 0.43-0.52 on average at 20 per request, up to 1.3 at the ends of the list;
 * at 6 per request they moved 0.27. A chapter's findings go as several small
 * requests in parallel, each carrying the whole chapter.
 */
export const MAX_FINDINGS_PER_REQUEST = 6;

export interface WriterRule {
  category: string;
  content: string;
}

export interface TriageInput {
  id: string;
  category: string;
  severity: string;
  description: string;
  suggestion?: string | null;
  anchorQuote?: string | null;
}

export interface TriageJudgement {
  findingId: string;
  /** 0-10, normalised from the level spectrum. */
  impact: number;
  /** Probability that this note contradicts a rule the writer has stated. */
  ruleConflict: number;
  impactConfidence: number;
}

/** The shape a caller hands to the client, built so the questions share state. */
export function buildTriageRequest(input: {
  chapter: string;
  findings: readonly TriageInput[];
  /** The captured voice, when the book has one. */
  voiceFingerprint?: string | null;
  /** What the writer has already told the product to do or avoid. */
  writerRules?: readonly WriterRule[];
}): {
  state: Record<string, unknown>;
  questions: Record<string, { type: string; instructions: unknown; criteria?: unknown }>;
} {
  if (input.findings.length === 0) {
    throw new Error("finding-triage: nothing to judge");
  }
  if (input.findings.length > MAX_FINDINGS_PER_REQUEST) {
    throw new Error(
      `finding-triage: ${input.findings.length} findings exceeds ${MAX_FINDINGS_PER_REQUEST}; chunk the batch`
    );
  }

  const state: Record<string, unknown> = {
    chapter: input.chapter,
    findings: input.findings.map((f) => ({
      category: f.category,
      severity: f.severity,
      description: f.description,
      suggestion: f.suggestion ?? null,
      passage: f.anchorQuote ?? null,
    })),
  };
  if (input.voiceFingerprint) state.author_voice = input.voiceFingerprint;
  if (input.writerRules?.length) {
    state.writer_rules = input.writerRules.map((r) => ({
      kind: r.category,
      rule: r.content,
    }));
  }

  const questions: Record<string, { type: string; instructions: unknown; criteria?: unknown }> = {};

  input.findings.forEach((finding, index) => {
    // The question points at its finding by path rather than repeating it, so
    // every question in the request shares one copy of the chapter and the list.
    const path = `\`findings[${index}]\``;

    questions[`impact_${finding.id}`] = {
      type: "score",
      instructions: `Consider the editorial note at ${path}, against the chapter it is about. If the writer took this note, how much better would the chapter be for a reader?`,
      criteria: IMPACT_LEVELS,
    };

    questions[`conflict_${finding.id}`] = {
      type: "noul",
      instructions: `Consider the editorial note at ${path} against \`writer_rules\`, which is what this writer has already decided about their own book. Does taking this note require undoing one of those decisions?`,
      criteria: {
        true: "Following this note would break a rule the writer has stated: it links things they said to keep apart, reopens a beat they closed, renumbers what they fixed, or flags a pattern they said is deliberate.",
        false: "Following this note leaves every stated rule intact. It is about something the writer has not ruled on.",
      },
    };
  });

  return { state, questions };
}

interface RawScore {
  type: "score";
  score: number;
  confidence: number;
}
interface RawNoul {
  type: "noul";
  noul: number;
}

/** Pair each finding with its two answers; skip any that did not come back. */
export function readTriageAnswers(
  answers: Record<string, unknown>,
  findings: readonly TriageInput[]
): TriageJudgement[] {
  const top = IMPACT_LEVELS.length - 1;
  const judged: TriageJudgement[] = [];

  for (const finding of findings) {
    const impact = answers[`impact_${finding.id}`] as RawScore | undefined;
    const conflict = answers[`conflict_${finding.id}`] as RawNoul | undefined;
    if (impact?.type !== "score" || conflict?.type !== "noul") continue;

    const clamped = Math.min(Math.max(impact.score, 0), top);
    judged.push({
      findingId: finding.id,
      impact: (clamped / top) * 10,
      ruleConflict: conflict.noul,
      impactConfidence: impact.confidence,
    });
  }

  return judged;
}

/**
 * How much a conflict with a stated rule discounts a finding's impact.
 *
 * Policy, deliberately in code and deliberately separate from the judgements:
 * a note asking the writer to undo their own decision is worth much less than
 * its impact suggests, but it is not suppressed. They still get to change
 * their mind, and the rule may be the thing that is wrong.
 */
const CONFLICT_PENALTY = 0.6;

/** The writer-facing order. Pure: changing this never re-runs inference. */
export function rankFindings<T extends TriageJudgement>(judged: readonly T[]): T[] {
  return [...judged].sort((a, b) => weight(b) - weight(a));
}

function weight(j: TriageJudgement): number {
  return j.impact * (1 - CONFLICT_PENALTY * j.ruleConflict);
}
