/**
 * The beta gate, asked as a typed question instead of read out of prose.
 *
 * `beta-reader-parser.ts` is 402 lines of regex recovering a verdict and a
 * score from whatever the panel happened to write, in whatever language, and
 * its default is `FAILED`. A report the regex cannot read is a chapter that
 * failed. Measured on the owner's own book: `betaScore` null on 28 of 28
 * chapters, the score column empty product-wide.
 *
 * A System One question cannot miss. The verdict is one of three labels by
 * construction, the readiness is a position on a described spectrum, and both
 * arrive with a confidence the code can act on. Nothing is parsed, and nothing
 * depends on the panel writing "GATE RESULT: PASSED" in English.
 *
 * This does NOT replace the parser. The parser still recovers the personas,
 * the emotion table and the engagement curve, which are data the report
 * genuinely carries. It replaces the two fields the parser guesses worst.
 *
 * OFF unless the owner sets both `TYPESAFE_API_KEY` and `BETA_JUDGE_ENABLED=1`.
 * A key alone does nothing; a flag alone does nothing. On any failure it
 * answers null and the parser's result stands — a judgement that did not
 * arrive must never cost the writer their run.
 */

import type { GateResult } from "./types";

/**
 * The readiness spectrum, bottom to top.
 *
 * Each level names a situation a reader would recognise. "Good" would tell the
 * model nothing; a level has to stand on its own, because the position between
 * two of them is what becomes the score.
 */
export const BETA_READINESS_LEVELS = [
  "A reader puts the chapter down before the end. Confusion, boredom or a broken promise drives them out.",
  "A reader finishes it, but out of duty. The chapter drags, repeats itself, or asks them to take too much on trust.",
  "A reader finishes it willingly. It works, with soft passages they would not miss if they were cut.",
  "A reader finishes it held. The scene lands, the voice is steady, and they trust where it is going.",
  "A reader finishes it and immediately wants the next chapter. Nothing in it needs defending.",
] as const;

export const BETA_JUDGE_QUESTIONS = {
  verdict: {
    type: "choice" as const,
    instructions:
      "A panel of beta readers reported on this chapter. Judging the chapter itself, and using the panel's reactions as evidence, is it ready for a reader?",
    criteria: {
      // Calibrated against 28 real reports. The first wording made `passed`
      // mean "nothing left to fix", and the panel routinely passes a chapter
      // while naming two important-but-fixable notes — so the judge read
      // near_miss where the gate reads pass. These say what the gate means.
      passed:
        "The panel would let this through. No critical findings, and nothing structural must change before a reader sees it. Important notes about pacing, density or emphasis are compatible with a pass when they are fixable without touching the story.",
      near_miss:
        "Held back, but only just. One named weakness has to be addressed first, and it is a single focused pass rather than a rewrite.",
      failed:
        "Not ready for a reader. Something the panel names is critical, structural, or breaks the story, and needs real revision.",
    },
  },
  readiness: {
    type: "score" as const,
    instructions:
      "How ready is this chapter for a reader, judged on the chapter itself with the panel's reactions as evidence?",
    criteria: BETA_READINESS_LEVELS,
  },
} as const;

/**
 * Confidence floors, measured on 28 real reports rather than guessed.
 *
 * The verdict is the judgement worth gating: at confidence >= 0.5 it matched
 * the report's own stated verdict 14 times out of 17; below it, 1 out of 4.
 * Under the floor the parser's verdict stands and the judgement is recorded
 * for review rather than acted on.
 *
 * The readiness floor is lower on purpose. The parser produces NO score on
 * 25 of 28 reports, so an uncertain number is still strictly more than
 * nothing — and readiness confidence was 0.58 or better on every report.
 */
export const MIN_VERDICT_CONFIDENCE = 0.5;
export const MIN_READINESS_CONFIDENCE = 0.35;

/** Kept for callers that want a single floor; the verdict one is the strict. */
export const MIN_JUDGE_CONFIDENCE = MIN_VERDICT_CONFIDENCE;

/** The product stores 0-10; the spectrum is a position between levels. */
export function readinessToScore(position: number): number {
  const top = BETA_READINESS_LEVELS.length - 1;
  const clamped = Math.min(Math.max(position, 0), top);
  return Math.round((clamped / top) * 10 * 100) / 100;
}

/** The gate's own vocabulary, or null for a label this code does not know. */
export function verdictFrom(label: string): GateResult["result"] | null {
  switch (label) {
    case "passed":
      return "PASSED";
    case "near_miss":
      return "NEAR_MISS";
    case "failed":
      return "FAILED";
    default:
      return null;
  }
}

/**
 * Both switches, because a key that leaks into an environment must not by
 * itself start spending, and a flag flipped during a config sweep must not
 * either. Same rule as the managed tier.
 */
export function judgeConfigured(env: Record<string, string | undefined>): boolean {
  return env.BETA_JUDGE_ENABLED === "1" && !!env.TYPESAFE_API_KEY?.trim();
}

export interface BetaJudgement {
  verdict: GateResult["result"];
  /** 0-10, the way the product stores a beta score. */
  score: number;
  /** Raw position on the readiness spectrum, for diagnosis. */
  readiness: number;
  verdictConfidence: number;
  readinessConfidence: number;
  /** The verdict cleared its floor and may be acted on. */
  verdictUsable: boolean;
  /** The score cleared its floor and may be stored. */
  scoreUsable: boolean;
}

/**
 * Ask the panel's report a typed question.
 *
 * @returns the judgement, or null when the judge is off, the service fails, or
 *          the answer is a shape this code does not recognise. Null always
 *          means "use the parser".
 */
export async function judgeBetaRead(input: {
  report: string;
  chapter?: string;
}): Promise<BetaJudgement | null> {
  if (!judgeConfigured(process.env)) return null;

  try {
    const { TypeSafeClient } = await import("@typesafe-ai/sdk");
    const client = new TypeSafeClient();

    // One request: both questions see the same state and run in parallel.
    const response = await client.systemOne({
      state: input.chapter
        ? { chapter: input.chapter, panel_report: input.report }
        : { panel_report: input.report },
      questions: BETA_JUDGE_QUESTIONS,
    });

    const verdictAnswer = response.answers.verdict;
    const readinessAnswer = response.answers.readiness;
    if (verdictAnswer?.type !== "choice" || readinessAnswer?.type !== "score") {
      return null;
    }

    const verdict = verdictFrom(verdictAnswer.choice);
    if (!verdict) return null;

    return {
      verdict,
      score: readinessToScore(readinessAnswer.score),
      readiness: readinessAnswer.score,
      verdictConfidence: verdictAnswer.confidence,
      readinessConfidence: readinessAnswer.confidence,
      verdictUsable: verdictAnswer.confidence >= MIN_VERDICT_CONFIDENCE,
      scoreUsable: readinessAnswer.confidence >= MIN_READINESS_CONFIDENCE,
    };
  } catch (error) {
    console.error(
      "[BetaJudge] judgement unavailable, falling back to the parser:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
