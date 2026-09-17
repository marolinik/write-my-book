/**
 * Session-level memory of approvals the writer already granted.
 *
 * The RequestApproval gate is driven by the model: nothing stops it from asking
 * for the same approval twice, and some models do (observed: the story-bible
 * workflow prompting the writer three times for the same document). Prompt text
 * cannot guarantee otherwise, so the gate remembers.
 *
 * Only APPROVALS are remembered. A rejection or a "modify" must reach the
 * writer again — the agent is expected to revise and re-ask, and replaying a
 * stale "no" would deadlock the session.
 */

import type { ApprovalResponse } from "./types";

/** Approval decisions keyed by {@link approvalCacheKey}. */
export type ApprovalCache = Map<string, ApprovalResponse>;

/**
 * Stable key for an approval request: the title, else the description, both
 * normalized for case and surrounding whitespace. Returns null when the request
 * carries neither, in which case it must always reach the writer.
 */
export function approvalCacheKey(input: {
  title?: string;
  description?: string;
}): string | null {
  const raw = input.title?.trim() || input.description?.trim();
  if (!raw) return null;
  return raw.toLowerCase().replace(/\s+/g, " ");
}

/** Whether a decision may be remembered for the rest of the session. */
export function isCacheableDecision(decision: ApprovalResponse["decision"]): boolean {
  return decision === "approve";
}
