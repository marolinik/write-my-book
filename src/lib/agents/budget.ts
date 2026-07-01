/**
 * Pure budget / cost-limit helpers for agent sessions.
 *
 * Extracted from the orchestrator streaming loop and the BullMQ worker so the
 * money-path decisions — is the transported cost limit usable? is the session
 * over budget? should the wrap-up warning fire? — are the single source of
 * truth AND unit-testable without standing up the whole streaming loop.
 *
 * Design invariant: a NON-finite budget (Infinity/NaN) means "unlimited" and is
 * never over budget and never warns. This is deliberate — an unlimited session
 * is a valid configuration; only a finite ceiling is enforceable.
 */

/**
 * Normalize a session cost limit that may have been mangled in transport.
 *
 * BullMQ serializes job data as JSON, which turns `Infinity` into `null`. A
 * `null` / `undefined` / `NaN` / non-finite limit must NOT be silently treated
 * as a real limit (nor as "no limit at all", which let background sessions run
 * effectively unbounded — the bug this guards). Returns a finite number when
 * the input is usable, otherwise `undefined` so the caller applies its own
 * default ceiling.
 */
export function normalizeSessionCostLimit(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

/**
 * A finite budget is enforceable; an infinite (or otherwise non-finite) budget
 * means "unlimited" and is never over budget. Mirrors the orchestrator guard.
 */
export function isOverBudget(costUsd: number, budgetUsd: number): boolean {
  return Number.isFinite(budgetUsd) && costUsd > budgetUsd;
}

/**
 * Whether the one-shot budget warning should fire: only for a finite budget,
 * once accrued cost reaches `threshold` (default 80%) of it.
 */
export function isBudgetWarning(
  costUsd: number,
  budgetUsd: number,
  threshold = 0.8
): boolean {
  return Number.isFinite(budgetUsd) && costUsd >= threshold * budgetUsd;
}

/**
 * Resolve the terminal reason for a session once a limit has been crossed.
 * Budget exhaustion takes precedence over time (matches the orchestrator's
 * `overBudget ? "budget" : "timeout"` at the crossing point); neither set →
 * "natural".
 */
export function resolveEndReason(
  overBudget: boolean,
  overTime: boolean
): "natural" | "budget" | "timeout" {
  if (overBudget) return "budget";
  if (overTime) return "timeout";
  return "natural";
}
