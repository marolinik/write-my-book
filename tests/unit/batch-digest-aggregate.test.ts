import { describe, it, expect } from "vitest";
import {
  aggregateBatchDigest,
  type BatchDigestParams,
} from "@/lib/agents/batch-digest-aggregate";

/**
 * Pure fan-in digest aggregation (BATCH-SPEC §6). No infra — asserts the digest
 * SHAPE, the finding roll-up, the passes counts, and the precedence-ordered
 * terminal status / halt reason (cancelled > halted > failed > done).
 */

const BASE: BatchDigestParams = {
  workflowIds: ["dev-edit", "line-edit"],
  chapterStart: 1,
  chapterEnd: 2,
  budgetCapUsd: 10,
  spentUsd: 4.2,
  halted: false,
  cancelled: false,
  failureCount: 0,
  sessions: [],
  findings: [],
  chapters: [],
  generatedAt: "2026-07-06T02:00:00.000Z",
};

describe("aggregateBatchDigest", () => {
  it("rolls up a clean run into status 'done' with findings by severity + chapter", () => {
    const res = aggregateBatchDigest({
      ...BASE,
      sessions: [
        { status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 2.1 },
        { status: "completed", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: 2.1 },
      ],
      findings: [
        { severity: "critical", category: "pacing", chapterNumber: 1 },
        { severity: "suggestion", category: "dialogue", chapterNumber: 1 },
        { severity: "suggestion", category: "prose", chapterNumber: 2 },
      ],
      chapters: [
        { chapterNumber: 1, status: "drafted", betaGate: null },
        { chapterNumber: 2, status: "drafted", betaGate: null },
      ],
    });

    expect(res.status).toBe("done");
    expect(res.haltReason).toBeNull();
    expect(res.completedCount).toBe(2);
    expect(res.digest.passes).toEqual({
      total: 2,
      completed: 2,
      skipped: 0,
      failed: 0,
    });
    expect(res.digest.findings.total).toBe(3);
    expect(res.digest.findings.bySeverity).toEqual({ critical: 1, suggestion: 2 });
    expect(res.digest.findings.byChapter).toEqual({ "1": 2, "2": 1 });
    expect(res.digest.chapterRange).toEqual({ start: 1, end: 2 });
    expect(res.digest.workflowIds).toEqual(["dev-edit", "line-edit"]);
    expect(res.digest.generatedAt).toBe("2026-07-06T02:00:00.000Z");
  });

  it("ALWAYS marks statusAutoAdvanceSuppressed true (batch children never auto-advance)", () => {
    const res = aggregateBatchDigest({
      ...BASE,
      sessions: [
        { status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 1 },
      ],
    });
    expect(res.digest.statusAutoAdvanceSuppressed).toBe(true);
  });

  it("halted + spent>=cap => status 'halted', haltReason 'budget_cap'", () => {
    const res = aggregateBatchDigest({
      ...BASE,
      halted: true,
      spentUsd: 10.5,
      budgetCapUsd: 10,
      sessions: [
        { status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 5 },
        { status: "skipped", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: null },
      ],
    });
    expect(res.status).toBe("halted");
    expect(res.haltReason).toBe("budget_cap");
    expect(res.digest.passes.skipped).toBe(1);
    expect(res.skippedCount).toBe(1);
  });

  it("halted + spent<cap => status 'halted', haltReason 'provider_failures'", () => {
    const res = aggregateBatchDigest({
      ...BASE,
      halted: true,
      spentUsd: 1.5,
      budgetCapUsd: 10,
      failureCount: 5,
      sessions: [
        { status: "failed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: null },
        { status: "skipped", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: null },
      ],
    });
    expect(res.status).toBe("halted");
    expect(res.haltReason).toBe("provider_failures");
  });

  it("cancelled takes precedence over halted => status 'cancelled'", () => {
    const res = aggregateBatchDigest({
      ...BASE,
      cancelled: true,
      halted: true,
      spentUsd: 10.5,
      sessions: [
        { status: "failed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: null },
      ],
    });
    expect(res.status).toBe("cancelled");
    expect(res.haltReason).toBe("cancelled");
  });

  it("no child completed (all failed/skipped, not halted) => status 'failed'", () => {
    const res = aggregateBatchDigest({
      ...BASE,
      sessions: [
        { status: "failed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: null },
        { status: "skipped", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: null },
      ],
    });
    expect(res.status).toBe("failed");
    expect(res.haltReason).toBeNull();
    expect(res.failedCount).toBe(1);
    expect(res.skippedCount).toBe(1);
  });

  it("an empty batch (no sessions) is 'done', not 'failed'", () => {
    const res = aggregateBatchDigest({ ...BASE, sessions: [] });
    expect(res.status).toBe("done");
    expect(res.digest.passes.total).toBe(0);
  });

  it("surfaces chapter status/betaGate snapshot for the digest view", () => {
    const res = aggregateBatchDigest({
      ...BASE,
      sessions: [
        { status: "completed", chapterNumber: 1, workflowId: "beta-read", actualCostUsd: 1 },
      ],
      chapters: [
        { chapterNumber: 1, status: "drafted", betaGate: "passed" },
        { chapterNumber: 2, status: "drafted", betaGate: null },
      ],
    });
    expect(res.digest.chapters).toEqual([
      { chapterNumber: 1, status: "drafted", betaGate: "passed" },
      { chapterNumber: 2, status: "drafted", betaGate: null },
    ]);
  });
});
