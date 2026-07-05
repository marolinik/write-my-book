/**
 * Pure fan-in digest aggregation for overnight/batch editorial runs.
 *
 * This is the roll-up half of the batch feature: after every child of a
 * BatchRun is terminal, the digest Worker (`src/lib/queue/batch-digest.ts`)
 * reads EditFinding + AgentSession + UsageRecord + Chapter + the Redis ledger,
 * then hands the plain rows to THIS function to shape into `BatchRun.digest`.
 *
 * Kept pure and infra-free (mirrors `batch-budget.ts` / `budget.ts`) so the
 * digest SHAPE + the derived batch status are the single source of truth AND
 * unit-testable without Prisma, Redis, or a running worker.
 *
 * Aggregation, NOT new capture: every source already persists per-child today
 * (BATCH-SPEC §2.4, §6). The digest must read the tables directly and must NOT
 * depend on ephemeral state (SessionBrief only exists on early-end, the SSE
 * `complete` message is not persisted) — see BATCH-SPEC §6.2.
 */

/** One child session row the digest reads (subset of AgentSession). */
export interface BatchDigestSessionInput {
  /** running | completed | failed | skipped | paused */
  status: string;
  chapterNumber: number | null;
  workflowId: string | null;
  actualCostUsd: number | null;
}

/** One finding row the digest reads (subset of EditFinding). */
export interface BatchDigestFindingInput {
  severity: string;
  category: string;
  chapterNumber: number;
}

/** One chapter row the digest reads (subset of Chapter) — for status surfacing. */
export interface BatchDigestChapterInput {
  chapterNumber: number;
  status: string;
  betaGate: string | null;
}

export interface BatchDigestParams {
  workflowIds: string[];
  chapterStart: number;
  chapterEnd: number;
  /** Configured aggregate ceiling (finite — validated at enqueue). */
  budgetCapUsd: number;
  /** Reconciled from the Redis ledger `batch:{id}:spent` (estimate, not billed). */
  spentUsd: number;
  /** Circuit-breaker / budget-cap flag (Redis `batch:{id}:halted` OR DB). */
  halted: boolean;
  /** User-cancelled batch — takes precedence over halted/done. */
  cancelled: boolean;
  /** Redis `batch:{id}:failures` count — disambiguates the halt reason. */
  failureCount: number;
  sessions: BatchDigestSessionInput[];
  findings: BatchDigestFindingInput[];
  chapters: BatchDigestChapterInput[];
  /** Injectable clock for deterministic tests. Defaults to now(). */
  generatedAt?: string;
}

/** Terminal batch status the digest job writes to `BatchRun.status`. */
export type DerivedBatchStatus = "done" | "failed" | "halted" | "cancelled";

export type BatchHaltReason =
  | "budget_cap"
  | "provider_failures"
  | "cancelled"
  | null;

/** The structured roll-up persisted to `BatchRun.digest` (Json). */
export interface BatchDigest {
  workflowIds: string[];
  chapterRange: { start: number; end: number };
  passes: {
    total: number;
    completed: number;
    skipped: number;
    failed: number;
  };
  spentUsd: number;
  budgetCapUsd: number;
  halted: boolean;
  haltReason: BatchHaltReason;
  findings: {
    total: number;
    bySeverity: Record<string, number>;
    byChapter: Record<string, number>;
  };
  chapters: Array<{
    chapterNumber: number;
    status: string;
    betaGate: string | null;
  }>;
  /**
   * TRUE always for v1 batches: batch children do NOT auto-advance chapter
   * status (dev_edited/line_edited/beta_read) — the writer advances manually
   * after reading the digest (owner decision #7, BATCH-SPEC §6.3). Surfaced so
   * the UI can state "statuses unchanged — advance manually" honestly.
   */
  statusAutoAdvanceSuppressed: boolean;
  generatedAt: string;
}

export interface BatchDigestResult {
  digest: BatchDigest;
  status: DerivedBatchStatus;
  haltReason: BatchHaltReason;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
}

/**
 * Shape the persisted per-child rows of a finished batch into a `BatchRun.digest`
 * plus the derived terminal status + counts. Pure: same inputs → same output.
 *
 * Status precedence (BATCH-SPEC §2.1 lifecycle): cancelled > halted > failed
 * (no child completed) > done. `failed` means the batch produced NO successful
 * child (all failed/skipped), NOT "any child failed".
 */
export function aggregateBatchDigest(
  params: BatchDigestParams
): BatchDigestResult {
  const {
    workflowIds,
    chapterStart,
    chapterEnd,
    budgetCapUsd,
    spentUsd,
    halted,
    cancelled,
    sessions,
    findings,
    chapters,
    generatedAt,
  } = params;

  const total = sessions.length;
  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const skippedCount = sessions.filter((s) => s.status === "skipped").length;
  const failedCount = sessions.filter((s) => s.status === "failed").length;

  // ── Findings roll-up (severity + chapter breakdown) ────────────────
  const bySeverity: Record<string, number> = {};
  const byChapter: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    const key = String(f.chapterNumber);
    byChapter[key] = (byChapter[key] ?? 0) + 1;
  }

  // ── Terminal status + halt reason (precedence-ordered) ─────────────
  let status: DerivedBatchStatus;
  let haltReason: BatchHaltReason;
  if (cancelled) {
    status = "cancelled";
    haltReason = "cancelled";
  } else if (halted) {
    status = "halted";
    haltReason =
      Number.isFinite(budgetCapUsd) && spentUsd >= budgetCapUsd
        ? "budget_cap"
        : "provider_failures";
  } else if (total > 0 && completedCount === 0) {
    // No child produced a successful result — a batch-level failure.
    status = "failed";
    haltReason = null;
  } else {
    status = "done";
    haltReason = null;
  }

  const digest: BatchDigest = {
    workflowIds,
    chapterRange: { start: chapterStart, end: chapterEnd },
    passes: {
      total,
      completed: completedCount,
      skipped: skippedCount,
      failed: failedCount,
    },
    spentUsd,
    budgetCapUsd,
    halted,
    haltReason,
    findings: {
      total: findings.length,
      bySeverity,
      byChapter,
    },
    chapters: chapters.map((c) => ({
      chapterNumber: c.chapterNumber,
      status: c.status,
      betaGate: c.betaGate,
    })),
    statusAutoAdvanceSuppressed: true,
    generatedAt: generatedAt ?? new Date().toISOString(),
  };

  return {
    digest,
    status,
    haltReason,
    completedCount,
    failedCount,
    skippedCount,
  };
}
