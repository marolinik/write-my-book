/**
 * Display status for a finding in the agent-facing <finding_history> block.
 *
 * D-55: a writer DISMISSAL and a system REJECT are distinct intents. They are
 * distinguished by the `status` column ("dismissed" vs "rejected"); only a
 * genuine reject carries the `rejectedAt` timestamp (+ `rejectionReason`). A
 * dismissal records `status:"dismissed"` + `dismissReason` and NO reject
 * timestamp, so downstream analytics can tell them apart.
 *
 * The renderer therefore derives the display status from `status` first, falling
 * back to the legacy timestamps for rows written before this split (older
 * dismissals still carry `rejectedAt`). Pure — no I/O.
 */
export function findingHistoryStatus(f: {
  status: string;
  appliedAt: Date | null;
  rejectedAt: Date | null;
}): "applied" | "dismissed" | "pending" {
  if (f.appliedAt || f.status === "applied") return "applied";
  // Both writer-dismissed and system-rejected findings are resolved; either
  // reads as [dismissed] in the history so the agent does not re-raise them.
  // `|| f.rejectedAt` keeps legacy dismissals (pre-D-55) rendering correctly.
  if (f.status === "dismissed" || f.status === "rejected" || f.rejectedAt) {
    return "dismissed";
  }
  return "pending";
}
