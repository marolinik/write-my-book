/**
 * When a rule is saved, retire an older rule that says the same thing.
 *
 * The less detailed of the two is deactivated, never deleted: the writer can
 * see it and switch it back on. OFF unless the owner sets both
 * `TYPESAFE_API_KEY` and `RULE_DEDUPE_ENABLED=1`; any failure leaves every
 * rule as it was.
 */

import {
  buildDedupeRequest,
  readDedupe,
  pickDuplicate,
  keepOf,
  MAX_RULES_PER_REQUEST,
  type Rule,
} from "./rule-dedupe";

export function ruleDedupeConfigured(env: Record<string, string | undefined>): boolean {
  return env.RULE_DEDUPE_ENABLED === "1" && !!env.TYPESAFE_API_KEY?.trim();
}

export async function supersedeDuplicateRule(input: {
  memoryId: string;
  env?: Record<string, string | undefined>;
}): Promise<{ superseded: string; kept: string } | null> {
  const env = input.env ?? process.env;
  if (!ruleDedupeConfigured(env)) return null;

  const { db } = await import("@/lib/db");
  const fresh = await db.writerMemory.findUnique({
    where: { id: input.memoryId },
    select: { id: true, userId: true, bookId: true, content: true },
  });
  if (!fresh) return null;

  const others: Rule[] = await db.writerMemory.findMany({
    where: { userId: fresh.userId, bookId: fresh.bookId, active: true, id: { not: fresh.id } },
    select: { id: true, content: true },
  });
  if (others.length === 0) return null;

  let duplicate: { id: string; p: number } | null;
  try {
    const { TypeSafeClient } = await import("@typesafe-ai/sdk");
    const client = new TypeSafeClient();
    const batches: Rule[][] = [];
    for (let i = 0; i < others.length; i += MAX_RULES_PER_REQUEST) {
      batches.push(others.slice(i, i + MAX_RULES_PER_REQUEST));
    }
    const scores = await Promise.all(
      batches.map(async (batch) => {
        const { state, questions } = buildDedupeRequest(fresh.content, batch);
        const response = await client.systemOne({ state, questions } as never);
        return readDedupe(response.answers as Record<string, unknown>, batch);
      })
    );
    duplicate = pickDuplicate(scores.flat());
  } catch (error) {
    console.error(
      "[RuleDedupe] not checked, rules left as they were:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
  if (!duplicate) return null;

  const old = others.find((r) => r.id === duplicate.id) as Rule;
  const kept = keepOf(old, fresh);
  const superseded = kept === fresh.id ? old.id : fresh.id;
  await db.writerMemory.update({ where: { id: superseded }, data: { active: false } });
  return { superseded, kept };
}
