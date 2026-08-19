/**
 * The ONE terminal-status set for a `BatchRun` (D-186c).
 *
 * Three surfaces used to keep their own copy of "which statuses are finished":
 * the shared live view (`live-batch-view.ts`), the cancel route, and the batch
 * dialog's poll loop. Two of the three omitted `halted` — so a budget-cap halt
 * (written by the fan-in digest, i.e. genuinely terminal) was treated as still
 * in flight: the dialog polled it forever and kept offering "Cancel batch",
 * and the cancel route would happily re-flip a halted run to `cancelled`,
 * overwriting the digest's own reconciled `haltReason`. One set, imported
 * everywhere, so the three can no longer drift.
 *
 * DELIBERATELY DEPENDENCY-FREE: this module is imported by a client component
 * as well as by server routes, so it must never pull in `db`, Redis, or any
 * other server-only module. Keep it that way.
 */

/**
 * Statuses that mean "this batch is over". Reaching one of them implies the
 * reconciled row has been written (by the digest, or by a user cancel), so a
 * live derivation must return it VERBATIM rather than recompute it.
 *
 * Mirrors the non-terminal half of `BatchStatus` (prisma): `queued`, `running`
 * and the Phase-2-only `needs_approval` are the states still in flight.
 */
export const TERMINAL_BATCH_STATUSES: ReadonlySet<string> = new Set([
  "done",
  "failed",
  "halted",
  "cancelled",
]);

/** True when the given `BatchRun.status` is terminal. */
export function isTerminalBatchStatus(status: string): boolean {
  return TERMINAL_BATCH_STATUSES.has(status);
}
