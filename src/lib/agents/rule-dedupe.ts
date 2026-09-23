/**
 * One decision, one rule.
 *
 * The owner explained "the signet and the brass template are two separate
 * objects" in three threads, and two of them each saved the rule: one short,
 * one longer and more specific. Measured over every pair of active rules in
 * the database (13 pairs), two questions: "same decision?" and "does the new
 * rule cover everything the old one asks?". The two real duplicates reached
 * 0.57 and 0.77 on one or the other; every other pair stayed at or under 0.12.
 * Neither question alone separated both, so the stronger answer counts.
 */

/** Two questions per rule; three rules keeps a request at six questions. */
export const MAX_RULES_PER_REQUEST = 3;

/** Real duplicates at 0.57 and 0.77, everything else at or under 0.12. */
const DUPLICATE_FROM = 0.5;

export interface Rule {
  id: string;
  content: string;
}

type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
};

export function buildDedupeRequest(
  newRule: string,
  existing: readonly Rule[]
): { state: Record<string, unknown>; questions: Record<string, NoulQuestion> } {
  if (existing.length > MAX_RULES_PER_REQUEST) {
    throw new Error(`rule-dedupe: ${existing.length} rules exceeds ${MAX_RULES_PER_REQUEST}; chunk them`);
  }
  const questions: Record<string, NoulQuestion> = {};
  existing.forEach((_, i) => {
    const old = `\`existing_rules[${i}]\``;
    questions[`same_${i}`] = {
      type: "noul",
      instructions: `A writer's rules for their own book. Does \`new_rule\` state the same decision as ${old}, so keeping both would only repeat it?`,
      criteria: {
        true: "Same decision: the same things, the same instruction, in other words or with more detail.",
        false: "A different decision, even if it is about related things.",
      },
    };
    questions[`covers_${i}`] = {
      type: "noul",
      instructions: `A writer's rules for their own book. Would a writer who follows \`new_rule\` automatically also be following ${old}: does \`new_rule\` cover everything ${old} asks, possibly with more detail?`,
      criteria: {
        true: `Yes: ${old} adds nothing that \`new_rule\` does not already say.`,
        false: `No: ${old} asks for something \`new_rule\` does not.`,
      },
    };
  });
  return { state: { new_rule: newRule, existing_rules: existing.map((r) => r.content) }, questions };
}

function noulOf(answer: unknown): number {
  const a = answer as { type?: string; noul?: number } | undefined;
  return a?.type === "noul" && typeof a.noul === "number" ? a.noul : 0;
}

/** Per existing rule, the stronger of the two answers. */
export function readDedupe(
  answers: Record<string, unknown>,
  existing: readonly Rule[]
): Array<{ id: string; p: number }> {
  return existing.map((rule, i) => ({
    id: rule.id,
    p: Math.max(noulOf(answers[`same_${i}`]), noulOf(answers[`covers_${i}`])),
  }));
}

export function pickDuplicate(
  scores: ReadonlyArray<{ id: string; p: number }>
): { id: string; p: number } | null {
  const best = [...scores].sort((a, b) => b.p - a.p)[0];
  return best && best.p >= DUPLICATE_FROM ? best : null;
}

/** Of two rules that say the same thing, the more detailed one stays. */
export function keepOf(a: Rule, b: Rule): string {
  return b.content.trim().length > a.content.trim().length ? b.id : a.id;
}
