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
  /** The move this one replaces if the writer rejects it (same pass). */
  alternativeToId: string | null;
  /** trim/expand: the lengths of the draft once one exists (the text loads on request). */
  draft?: { baseWords: number | null; draftWords: number | null } | null;
  payload: {
    kind?: string;
    chapterNumber?: number;
    targetPosition?: number;
    chapterNumbers?: number[];
    anchorQuote?: string;
    title?: string;
    targetWords?: number;
    instructions?: string;
    scope?: "opening" | "ending";
    lens?: "commercial";
  } | null;
}

/** Statuses that still offer the writer something to do. */
export const LIVE_MOVE_STATUSES = ["pending", "drafting", "drafted", "accepted", "applied"];
