/**
 * Batch-eligibility validation — the load-bearing v1 guardrail (BATCH-SPEC §7.2).
 *
 * v1 batches run UNATTENDED. To make "walk away" safe, only the four
 * findings/report-only editorial workflows are allowed. These carry neither the
 * `WriteChapter` tool (prose mutation — ghostwriter only) nor `RequestApproval`
 * (the approval gate — coach/ghostwriter/architect only), so a batch can never
 * silently rewrite the manuscript or block on an approval it can't resolve.
 *
 * Everything else — prose-mutating (`write-chapter`/`freewrite`/`revise`),
 * structural-doc, and conversational workflows — is REJECTED at the API.
 */

import { getWorkflow } from "@/lib/agents/workflows";

/**
 * The exact v1 allowlist (BATCH-SPEC §1.3 / §7.2). Derived from the tool
 * allowlists: eligible = carries neither `WriteChapter` nor `RequestApproval`.
 */
export const BATCH_ELIGIBLE_WORKFLOWS: ReadonlySet<string> = new Set([
  "dev-edit",
  "line-edit",
  "beta-read",
  "analyze",
]);

/**
 * True iff a workflow may run in an unattended v1 batch. Defense-in-depth: the
 * id must be on the allowlist AND resolve to a known, non-conversational
 * workflow (a conversational pass needs a live user and can never run unattended).
 */
export function isBatchEligible(workflowId: string): boolean {
  if (!BATCH_ELIGIBLE_WORKFLOWS.has(workflowId)) return false;
  const workflow = getWorkflow(workflowId);
  return workflow != null && workflow.conversational === false;
}

/** Return the subset of requested workflow ids that are NOT batch-eligible. */
export function findIneligibleWorkflows(workflowIds: readonly string[]): string[] {
  return workflowIds.filter((id) => !isBatchEligible(id));
}
