/**
 * Why a batch run stopped, said in the writer's language.
 *
 * `BatchRun.haltReason` is a machine enum with three writers in this codebase:
 * `cancelled`, `budget_cap`, `ledger_write_failed`. The batch history rendered
 * it verbatim, so a Serbian reader was told **"Zaustavljeno: cancelled"** —
 * every other field on the row translated, and the one that explains the thing
 * they actually want explained was the raw column.
 *
 * An unrecognised value still says something true rather than nothing. A run
 * that stopped for a reason the product cannot name is precisely the run a
 * writer most needs to ask about, and silence there reads as a bug rather than
 * as an answer.
 */

import type { UIStrings } from "@/lib/i18n/ui-strings";

/**
 * @param reason  the stored `haltReason`, or null when the run was not halted
 * @returns the writer-facing clause, or null when there is nothing to say
 */
export function haltReasonLabel(
  reason: string | null | undefined,
  t: UIStrings
): string | null {
  if (!reason) return null;

  switch (reason) {
    case "cancelled":
      return t.batchEditorial.haltCancelled;
    case "budget_cap":
      return t.batchEditorial.haltBudgetCap;
    case "ledger_write_failed":
      return t.batchEditorial.haltLedgerWriteFailed;
    default:
      return t.batchEditorial.haltUnknown;
  }
}
