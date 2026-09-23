/**
 * The pass that judges a chapter's pending findings and stores the answers.
 *
 * Judged once, ranked as often as the panel likes: the row carries the raw
 * impact and the raw rule conflict, never the weight. Storing the weight would
 * freeze today's policy into the data and make changing a sort order a
 * migration.
 *
 * OFF unless the owner sets both `TYPESAFE_API_KEY` and
 * `FINDING_TRIAGE_ENABLED=1`. A failure leaves every row exactly as it was: an
 * untriaged finding is shown unranked, which is what the product does today,
 * and is never worse than that.
 */

import {
  buildTriageRequest,
  readTriageAnswers,
  MAX_FINDINGS_PER_REQUEST,
  type TriageInput,
  type TriageJudgement,
  type WriterRule,
} from "./finding-triage";
import { readChapterText, readVoiceFingerprint } from "./book-evidence";

/** Both switches, the same rule as the managed tier and the beta judge. */
export function triageConfigured(env: Record<string, string | undefined>): boolean {
  return env.FINDING_TRIAGE_ENABLED === "1" && !!env.TYPESAFE_API_KEY?.trim();
}

/** Split a chapter's findings into batches one request can carry. */
export function chunkForTriage<T>(findings: readonly T[]): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < findings.length; i += MAX_FINDINGS_PER_REQUEST) {
    batches.push(findings.slice(i, i + MAX_FINDINGS_PER_REQUEST));
  }
  return batches;
}

/** What one judgement writes to its row. Raw answers only. */
export function rowUpdateFor(judgement: TriageJudgement): {
  impactScore: number;
  ruleConflict: number;
  triagedAt: Date;
} {
  return {
    impactScore: judgement.impact,
    ruleConflict: judgement.ruleConflict,
    triagedAt: new Date(),
  };
}

export interface TriageResult {
  judged: number;
  /** Findings sent but not answered for; their rows are untouched. */
  unanswered: number;
  requests: number;
  reason?: "disabled" | "nothing-pending" | "no-chapter-text" | "failed";
}

/**
 * Judge every pending finding on one chapter and store the answers.
 *
 * Reads the chapter's prose, the writer's active rules and the book's voice
 * fingerprint as shared state, so each question is asked against the evidence
 * that makes it answerable.
 */
export async function triageChapter(input: {
  bookId: string;
  chapterNumber: number;
  env?: Record<string, string | undefined>;
}): Promise<TriageResult> {
  const env = input.env ?? process.env;
  const empty: TriageResult = { judged: 0, unanswered: 0, requests: 0 };
  if (!triageConfigured(env)) return { ...empty, reason: "disabled" };

  const { db } = await import("@/lib/db");

  const findings = await db.editFinding.findMany({
    where: {
      bookId: input.bookId,
      chapterNumber: input.chapterNumber,
      status: "pending",
    },
    select: {
      id: true,
      category: true,
      severity: true,
      description: true,
      suggestion: true,
      anchorQuote: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (findings.length === 0) return { ...empty, reason: "nothing-pending" };

  const chapterText = await readChapterText(input.bookId, input.chapterNumber);
  if (!chapterText) return { ...empty, reason: "no-chapter-text" };

  const [rules, voiceFingerprint] = await Promise.all([
    readWriterRules(input.bookId),
    readVoiceFingerprint(input.bookId),
  ]);

  try {
    const { TypeSafeClient } = await import("@typesafe-ai/sdk");
    const client = new TypeSafeClient();

    // In parallel: each batch is small on purpose, carries the whole chapter,
    // and waits on no other. A batch that fails leaves its findings untriaged
    // without costing the others their answers.
    const batches = chunkForTriage(findings as TriageInput[]);
    const settled = await Promise.allSettled(
      batches.map(async (batch) => {
        const { state, questions } = buildTriageRequest({
          chapter: chapterText,
          findings: batch,
          voiceFingerprint,
          writerRules: rules,
        });
        const response = await client.systemOne({ state, questions } as never);
        return readTriageAnswers(response.answers as Record<string, unknown>, batch);
      })
    );

    const failures = settled.filter((s) => s.status === "rejected");
    if (failures.length === settled.length) {
      throw (failures[0] as PromiseRejectedResult).reason;
    }
    for (const failure of failures) {
      const reason = (failure as PromiseRejectedResult).reason;
      console.error(
        "[Triage] one batch failed, its findings left as they were:",
        reason instanceof Error ? reason.message : reason
      );
    }

    let judged = 0;
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const judgement of result.value) {
        await db.editFinding.update({
          where: { id: judgement.findingId },
          data: rowUpdateFor(judgement),
        });
        judged++;
      }
    }
    const requests = batches.length;

    return { judged, unanswered: findings.length - judged, requests };
  } catch (error) {
    console.error(
      "[Triage] pass failed, findings left as they were:",
      error instanceof Error ? error.message : error
    );
    return { ...empty, reason: "failed" };
  }
}

async function readWriterRules(bookId: string): Promise<WriterRule[]> {
  const { db } = await import("@/lib/db");
  const rows = await db.writerMemory.findMany({
    where: { bookId, active: true },
    select: { category: true, content: true },
  });
  return rows;
}
