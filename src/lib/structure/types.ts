/**
 * The structural-move shape the UI reads, as the moves API returns it.
 *
 * Shared by the reports panel and the agent panel so a proposal cannot come to
 * mean two different things in two places (S3-7).
 */
export interface StructureMove {
  id: string;
  kind: string;
  status: string;
  reason: string;
  evidence: string | null;
  confidence: number | null;
  resultSummary: string | null;
  rejectionReason: string | null;
  createdAt: string;
  appliedAt: string | null;
  payload: {
    kind?: string;
    chapterNumber?: number;
    targetPosition?: number;
    chapterNumbers?: number[];
    anchorQuote?: string;
    title?: string;
  } | null;
}

/** Statuses that still offer the writer something to do. */
export const LIVE_MOVE_STATUSES = ["pending", "accepted", "applied"];
