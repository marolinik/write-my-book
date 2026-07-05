/**
 * Pure batch money-path invariant for overnight/batch editorial runs.
 *
 * This is THE single new money-path invariant the batch feature introduces: an
 * aggregate dollar ceiling across ALL children of a BatchRun, layered on top of
 * (not competing with) each child's own per-session cost limit. The batch ledger
 * is an OUTER gate checked between children at dispatch — it decides only whether
 * the NEXT child starts, never interrupting a child mid-run.
 *
 * Kept pure and infra-free (mirrors `budget.ts`) so the gate decision is the
 * single source of truth AND unit-testable without Redis or a running worker.
 *
 * Design invariant: a NON-finite cap (Infinity/NaN) means "unlimited" — mirrors
 * `normalizeSessionCostLimit` in `budget.ts`. Only a finite ceiling is enforceable.
 */

/**
 * True iff a NEW batch child may start.
 *
 * - `halted` (circuit breaker / budget cap tripped) → never start.
 * - non-finite `capUsd` (e.g. Infinity) → unlimited, always allowed to start.
 * - else → start only while accrued `spentUsd` is strictly below `capUsd`.
 *
 * Gate semantics (see BATCH-SPEC §4.5): this bounds the GATE, not total spend.
 * Because the ledger increments on child COMPLETION and worker concurrency is 2,
 * up to `(concurrency - 1)` already-in-flight children can finish and overshoot
 * before the guard next trips. Worst-case total spend is therefore bounded by
 * `cap + (concurrency - 1) * maxPerSessionCap`, NOT "spend never exceeds cap".
 */
export function shouldRunBatchChild(
  spentUsd: number,
  capUsd: number,
  halted: boolean
): boolean {
  if (halted) return false;
  if (!Number.isFinite(capUsd)) return true; // unlimited (mirror normalizeSessionCostLimit)
  return spentUsd < capUsd;
}
