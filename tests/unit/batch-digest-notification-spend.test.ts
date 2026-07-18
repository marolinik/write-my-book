import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { BatchDigestJobData } from "@/lib/queue/batch-flow";

/**
 * D-16 (S2) regression probe — found during the P4 Priya money-path/batch
 * journey (2026-07-18), while re-checking the Z11 fix area.
 *
 * Z11 (fixed, batch-digest.ts:119-121 `effectiveSpent`) made the PERSISTED
 * `BatchRun.spentUsd` / `digest` JSON fall back to the DB actualCostUsd sum
 * when the Redis ledger read fails, instead of silently writing $0.
 *
 * But `processBatchDigestJob`'s morning `bookNotification.create` call
 * (src/lib/queue/batch-digest.ts ~line 199) builds its `message` string from
 * the RAW `ledger.spentUsd` (the pre-fallback value, forced to 0 by
 * `readBatchLedger`'s catch block on any Redis error) instead of the
 * corrected `effectiveSpent`. On a Redis ledger hiccup, the writer's
 * in-app "Overnight batch complete" notification -- the literal payoff
 * TEST-PLAN.md calls out for P4 Priya's Return step ("morning digest is
 * the payoff -- accurate, readable, actionable") -- reports "$0.00 spent"
 * while the BatchRun row underneath it correctly shows the real spend.
 * This is a distinct, narrower residual of the same code path Z11 already
 * fixed elsewhere in the same function.
 */

const h = vi.hoisted(() => {
  const redis = {
    get: vi.fn(() => Promise.reject(new Error("redis down"))),
    disconnect: vi.fn(),
  };
  return {
    redis,
    db: {
      batchRun: { findUnique: vi.fn(), update: vi.fn() },
      agentSession: { findMany: vi.fn() },
      editFinding: { findMany: vi.fn() },
      chapter: { findMany: vi.fn() },
      bookNotification: { create: vi.fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/connection", () => ({
  createRedisConnection: () => h.redis,
  getAppConnection: () => h.redis,
}));

import { processBatchDigestJob } from "@/lib/queue/batch-digest";

function makeDigestJob(): Job<BatchDigestJobData> {
  return { data: { batchId: "batch-d16" } } as unknown as Job<BatchDigestJobData>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("D-16: batch-digest notification message spend on Redis ledger failure", () => {
  it("reports the real DB-fallback spend in the notification text, not the ledger's $0 default", async () => {
    h.db.batchRun.findUnique.mockResolvedValue({
      id: "batch-d16",
      bookId: "book-1",
      userId: "user-1",
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 2,
      budgetCapUsd: 10,
      status: "running",
      halted: false,
      spentUsd: 0,
    });
    h.db.agentSession.findMany.mockResolvedValue([
      { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 3.5 },
      { id: "s2", status: "completed", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: 2.5 },
    ]);
    h.db.editFinding.findMany.mockResolvedValue([]);
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, status: "drafted", betaGate: null },
      { chapterNumber: 2, status: "drafted", betaGate: null },
    ]);
    // Redis ledger read fails (all 3 gets reject) -> readBatchLedger falls back
    // to its error default { spentUsd: 0, ledgerAvailable: false }. The real
    // spend (DB sum = 3.5 + 2.5 = $6.00) must still reach the notification.

    await processBatchDigestJob(makeDigestJob());

    // Persisted BatchRun row is correct (Z11's fix -- sanity check, not the point).
    const upd = h.db.batchRun.update.mock.calls[0][0];
    expect(upd.data.spentUsd).toBeCloseTo(6.0, 5);

    // The notification text the writer actually reads should say $6.00, not $0.00.
    const note = h.db.bookNotification.create.mock.calls[0][0].data;
    expect(note.message).toContain("$6.00");
    expect(note.message).not.toContain("$0.00");
  });
});
