/**
 * Read-time "honest live view" of a `BatchRun` (D-96 / D-120).
 *
 * The stored `BatchRun` columns lag reality until the fan-in digest runs: a
 * batch that is actively spending still reads `status:"queued"`, `spentUsd:0`,
 * `halted:false`, `startedAt:null`, because those columns are only reconciled
 * by `processBatchDigestJob`. Any surface that renders a MID-RUN batch must
 * therefore derive those four values from the child `AgentSession` rows (plus
 * the live Redis halt flag) at read time.
 *
 * D-96 fixed the single-batch poll route this way; D-120 found the LIST route
 * still served the raw row, so the same batch read "queued / $0.00" in the list
 * while the detail route already said "running / $0.0446". This module is the
 * ONE derivation both routes call, so the two can never disagree again.
 *
 * Two hard rules, both load-bearing for money-path honesty:
 *   1. A TERMINAL batch is returned VERBATIM. Once the digest has written the
 *      reconciled row, that row is the source of truth — a live derivation must
 *      never overwrite or contradict it (and a stale Redis flag must never
 *      relabel a finished 'done' batch as halted).
 *   2. The derivation may only UNDER-claim on infrastructure trouble. Spend is
 *      floored by the stored value so a reconciled figure can never regress,
 *      and a Redis miss yields `false` (never a fabricated halt).
 */

import { getAppConnection } from "@/lib/queue/connection";

/**
 * Terminal `BatchRun` statuses. Once reached, the fan-in digest has written the
 * FINAL reconciled row and the live view must return it verbatim.
 */
export const TERMINAL_BATCH_STATUSES: ReadonlySet<string> = new Set([
  "done",
  "failed",
  "halted",
  "cancelled",
]);

/** One child `AgentSession` row the derivation reads. */
export interface LiveBatchChildRow {
  status: string;
  actualCostUsd: number | null;
  startedAt: Date | null;
}

/**
 * The stored `BatchRun` columns the derivation reads. Both terminal signals are
 * optional so a caller may select either one: `digest` and `completedAt` are
 * written in the SAME update as the terminal status by the digest job, so
 * whichever the caller selected is a valid terminal marker.
 */
export interface StoredBatchRow<TStatus extends string = string> {
  status: TStatus;
  spentUsd?: number | null;
  halted?: boolean | null;
  startedAt?: Date | null;
  digest?: unknown;
  completedAt?: Date | null;
}

/** The four values a live-facing surface must derive rather than read raw. */
export interface LiveBatchFields<TStatus extends string = string> {
  status: TStatus | "queued" | "running";
  spentUsd: number;
  halted: boolean;
  startedAt: Date | null;
}

const NO_HALTED_BATCHES: ReadonlySet<string> = new Set();

/**
 * True once the digest has written the reconciled row (or the batch reached a
 * terminal status some other way, e.g. a user cancel). Terminal rows are
 * returned verbatim by {@link deriveLiveBatchFields}.
 */
export function isBatchTerminal(batch: StoredBatchRow): boolean {
  return (
    TERMINAL_BATCH_STATUSES.has(batch.status) ||
    batch.digest != null ||
    batch.completedAt != null
  );
}

/**
 * Derive the honest live-facing `status` / `spentUsd` / `halted` / `startedAt`
 * for one batch from its child rows. Pure (no I/O, no mutation): the caller
 * spreads the result over an immutable copy of the stored row, so the same
 * top-level shape is preserved and only the VALUES are made honest.
 *
 * @param liveHalted best-effort live Redis halt flag (see {@link readLiveHaltFlags})
 */
export function deriveLiveBatchFields<TStatus extends string>(
  batch: StoredBatchRow<TStatus>,
  children: readonly LiveBatchChildRow[],
  liveHalted: boolean
): LiveBatchFields<TStatus> {
  const storedSpend = Number(batch.spentUsd ?? 0);
  const storedHalted = batch.halted === true;
  const storedStart = batch.startedAt ?? null;

  // Rule 1: terminal truth wins — reconciled row verbatim, Redis not consulted.
  if (isBatchTerminal(batch)) {
    return {
      status: batch.status,
      spentUsd: storedSpend,
      halted: storedHalted,
      startedAt: storedStart,
    };
  }

  // Live spend = sum of finalized child costs, floored by the stored spend so a
  // reconciled terminal figure can never regress. (A child's actualCostUsd is
  // written at its own completion, so this rises as children finish; it equals
  // the digest's reconciled spend once every child is terminal.)
  const childSpend = children.reduce(
    (sum, child) => sum + Number(child.actualCostUsd ?? 0),
    0
  );

  // Live status: 'running' once any child is running/completed, else 'queued'.
  const anyChildActive = children.some(
    (child) => child.status === "running" || child.status === "completed"
  );

  // Live start: earliest child that has left the queue (BatchRun.startedAt is
  // never populated before the digest).
  const startedTimes = children
    .filter((child) => child.status !== "queued")
    .map((child) => child.startedAt)
    .filter((startedAt): startedAt is Date => startedAt != null)
    .map((startedAt) => startedAt.getTime());
  const earliestStart =
    startedTimes.length > 0 ? new Date(Math.min(...startedTimes)) : null;

  return {
    status: anyChildActive ? "running" : "queued",
    spentUsd: Math.max(childSpend, storedSpend),
    halted: storedHalted || liveHalted,
    startedAt: storedStart ?? earliestStart,
  };
}

/**
 * Best-effort read of the live Redis halt flags (`batch:{id}:halted`) for the
 * given batches. A mid-run budget-cap / circuit-breaker halt lives ONLY in
 * Redis until the digest fans in and persists `BatchRun.halted`, so the DB
 * column alone under-reports a halted-but-still-polling batch.
 *
 * Reuses the shared app connection (a lazy singleton — no per-request
 * connection churn, never disconnected). Every failure is logged and degrades
 * to "not halted" for that batch: the caller OR's in the durable DB column, so
 * a Redis miss can only UNDER-claim, never fabricate, a halt.
 *
 * Only pass NON-terminal batch ids — a terminal batch must use its reconciled
 * DB column verbatim.
 */
export async function readLiveHaltFlags(
  batchIds: readonly string[]
): Promise<ReadonlySet<string>> {
  if (batchIds.length === 0) return NO_HALTED_BATCHES;

  let redis: ReturnType<typeof getAppConnection>;
  try {
    redis = getAppConnection();
  } catch (err) {
    console.error(
      "[LiveBatchView] Redis connection unavailable for live halt read (non-fatal):",
      err instanceof Error ? err.message : err
    );
    return NO_HALTED_BATCHES;
  }

  const flagged = await Promise.all(
    batchIds.map(async (batchId) => {
      try {
        const raw = await redis.get(`batch:${batchId}:halted`);
        return raw === "1" ? batchId : null;
      } catch (err) {
        console.error(
          `[LiveBatchView] live halt read failed for batch ${batchId} (non-fatal):`,
          err instanceof Error ? err.message : err
        );
        return null;
      }
    })
  );

  return new Set(flagged.filter((batchId): batchId is string => batchId !== null));
}

/** Single-batch convenience wrapper around {@link readLiveHaltFlags}. */
export async function readLiveHaltFlag(batchId: string): Promise<boolean> {
  const flagged = await readLiveHaltFlags([batchId]);
  return flagged.has(batchId);
}
