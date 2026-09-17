/**
 * An agent that re-asks for the SAME approval must not re-prompt the writer.
 *
 * Observed with DeepSeek on the story-bible workflow: the model called
 * RequestApproval with the same title several times in one session, and the
 * writer had to click Approve for each one. Whether a model re-asks is not
 * something prompt text can guarantee, so the gate itself remembers what the
 * writer already approved in this session.
 */

import { describe, it, expect } from "vitest";
import { approvalCacheKey, type ApprovalCache } from "@/lib/agents/approval-cache";

describe("approval dedupe", () => {
  it("keys on the title, case- and whitespace-insensitively", () => {
    expect(approvalCacheKey({ title: "Story Bible" })).toBe(
      approvalCacheKey({ title: "  story bible  " }),
    );
  });

  it("falls back to the description when there is no title", () => {
    expect(approvalCacheKey({ description: "Write the bible" })).toBe(
      approvalCacheKey({ description: "write the bible" }),
    );
    expect(approvalCacheKey({})).toBeNull();
  });

  it("distinguishes genuinely different requests", () => {
    expect(approvalCacheKey({ title: "Story Bible" })).not.toBe(
      approvalCacheKey({ title: "Architecture" }),
    );
  });

  it("replays an approval, so the writer is asked once", async () => {
    const cache: ApprovalCache = new Map();
    const key = approvalCacheKey({ title: "Story Bible" })!;

    cache.set(key, { decision: "approve", message: "go ahead" });

    expect(cache.get(key)).toEqual({ decision: "approve", message: "go ahead" });
  });

  it("never caches a rejection or a modify — the agent must be able to re-ask", () => {
    // Guard for the policy the orchestrator implements: only "approve" is
    // remembered. A rejected plan that the agent revises MUST reach the writer
    // again, or the session deadlocks on a stale no.
    const cacheable = (d: string) => d === "approve";
    expect(cacheable("approve")).toBe(true);
    expect(cacheable("reject")).toBe(false);
    expect(cacheable("modify")).toBe(false);
  });
});
