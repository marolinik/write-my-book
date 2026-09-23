/**
 * Judge an applied fix and store the answer on its finding.
 *
 * Runs inside the writer's apply click, so it is bounded: OFF unless the owner
 * sets both `TYPESAFE_API_KEY` and `FIX_CHECK_ENABLED=1`, never longer than
 * its time budget, and any failure leaves the finding exactly as the apply
 * left it. An unchecked fix is shown as it always was.
 */

import { buildFixCheckRequest, readFixCheck, unchangedPassage } from "./fix-check";

// A first request after idle took over 5 s on the owner's machine; 8 s keeps a
// cold start from leaving a fix unchecked without making the click feel stuck.
const DEFAULT_TIMEOUT_MS = 8000;

export function fixCheckConfigured(env: Record<string, string | undefined>): boolean {
  return env.FIX_CHECK_ENABLED === "1" && !!env.TYPESAFE_API_KEY?.trim();
}

/** Returns the stored probability the problem remains, or null when nothing was stored. */
export async function checkAppliedFix(input: {
  finding: { id: string; category: string; description: string; suggestion?: string | null };
  before: string;
  after: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}): Promise<number | null> {
  const env = input.env ?? process.env;
  if (!fixCheckConfigured(env)) return null;

  const remains = unchangedPassage(input.before, input.after)
    ? 1
    : await judge(input, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (remains === null) return null;

  const { db } = await import("@/lib/db");
  await db.editFinding.update({
    where: { id: input.finding.id },
    data: { fixRemains: remains, fixCheckedAt: new Date() },
  });
  return remains;
}

async function judge(
  input: Parameters<typeof checkAppliedFix>[0],
  timeoutMs: number
): Promise<number | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { TypeSafeClient } = await import("@typesafe-ai/sdk");
    const { state, questions } = buildFixCheckRequest({
      category: input.finding.category,
      description: input.finding.description,
      suggestion: input.finding.suggestion,
      before: input.before,
      after: input.after,
    });
    const call = new TypeSafeClient().systemOne({ state, questions } as never);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs);
    });
    const response = await Promise.race([call, timeout]);
    return readFixCheck(response.answers as Record<string, unknown>);
  } catch (error) {
    console.error(
      "[FixCheck] not checked, finding left as applied:",
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
