import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { AgentJobData } from "@/lib/queue/agent-queue";

/**
 * Worker-side money-path guard (BATCH-SPEC §4.3): the pre-child budget/breaker
 * guard at the top of processAgentJob. The pure gate decision is unit-tested in
 * batch-budget.test.ts; here we assert the WORKER wiring around it:
 *   - a halted / over-cap batch child is marked 'skipped' and RETURNS without
 *     building the orchestrator (never re-fetches keys → never spends),
 *   - an under-cap / not-halted child is let through to the orchestrator build,
 *   - a NON-batch session never consults the batch ledger at all.
 *
 * Redis + db are mocked; the orchestrator is never reached on the skip paths.
 */
const h = vi.hoisted(() => {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    incrbyfloat: vi.fn(),
    publish: vi.fn(),
    rpush: vi.fn(),
    expire: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    redis,
    db: {
      agentSession: { update: vi.fn(), updateMany: vi.fn() },
      batchRun: { findUnique: vi.fn() },
      apiKey: { findMany: vi.fn() },
      book: { findFirst: vi.fn() },
      user: { findUnique: vi.fn() },
      usageRecord: { create: vi.fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/connection", () => ({
  createRedisConnection: () => h.redis,
  getAppConnection: () => h.redis,
}));

import { processAgentJob } from "@/lib/queue/agent-worker";

function makeJob(data: Partial<AgentJobData>): Job<AgentJobData> {
  return { data } as unknown as Job<AgentJobData>;
}

const BASE: Partial<AgentJobData> = {
  sessionId: "s1",
  bookId: "b1",
  userId: "u1",
  workflowId: "dev-edit",
  agentType: "dev-editor",
  coachRegistryId: "anthropic/sonnet",
  coachModelId: "claude",
  providerKey: "anthropic",
  language: "en",
  bookName: "Book",
  sessionCostLimit: 5,
  serverCeilingMs: 60_000,
  isConversational: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.db.agentSession.update.mockResolvedValue({});
  h.db.agentSession.updateMany.mockResolvedValue({ count: 0 });
  // Default: no durable DB halt. The guard reads BatchRun.halted as a fail-safe
  // fallback (M3) in parallel with the Redis ledger.
  h.db.batchRun.findUnique.mockResolvedValue(null);
  // No API keys → any child that gets PAST the guard fails the orchestrator
  // build downstream; the skip paths never reach this call at all.
  h.db.apiKey.findMany.mockResolvedValue([]);
});

describe("processAgentJob — batch pre-child guard", () => {
  it("skips a batch child (status 'skipped') without building the orchestrator when the batch is halted", async () => {
    h.redis.get.mockImplementation((key: string) =>
      Promise.resolve(key.endsWith(":halted") ? "1" : null)
    );

    await processAgentJob(
      makeJob({ ...BASE, batchId: "batch1", batchBudgetCapUsd: 10 })
    );

    expect(h.db.agentSession.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ status: "skipped" }),
    });
    // Orchestrator never built → keys never re-fetched → nothing spent.
    expect(h.db.apiKey.findMany).not.toHaveBeenCalled();
    expect(h.redis.incrbyfloat).not.toHaveBeenCalled();
    expect(h.redis.disconnect).toHaveBeenCalled();
  });

  it("skips a batch child when aggregate spend has reached the cap", async () => {
    h.redis.get.mockImplementation((key: string) =>
      Promise.resolve(key.endsWith(":spent") ? "10.5" : null)
    );

    await processAgentJob(
      makeJob({ ...BASE, batchId: "batch1", batchBudgetCapUsd: 10 })
    );

    expect(h.db.agentSession.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ status: "skipped" }),
    });
    expect(h.db.apiKey.findMany).not.toHaveBeenCalled();
  });

  it("does NOT skip when under cap and not halted — proceeds to build the orchestrator (fetches keys)", async () => {
    h.redis.get.mockImplementation((key: string) =>
      Promise.resolve(key.endsWith(":spent") ? "2" : null)
    );

    // No API keys → the orchestrator build throws downstream; we only assert
    // the guard let the child THROUGH (did not mark it skipped, did fetch keys).
    await expect(
      processAgentJob(
        makeJob({ ...BASE, batchId: "batch1", batchBudgetCapUsd: 10 })
      )
    ).rejects.toBeTruthy();

    expect(h.db.apiKey.findMany).toHaveBeenCalled();
    const markedSkipped = h.db.agentSession.update.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "skipped"
    );
    expect(markedSkipped).toBe(false);
  });

  it("never consults the batch ledger for a non-batch session (batchId absent)", async () => {
    h.redis.get.mockResolvedValue(null);

    await expect(
      processAgentJob(makeJob({ ...BASE }))
    ).rejects.toBeTruthy();

    const readBatchKey = h.redis.get.mock.calls.some((c) =>
      String(c[0]).startsWith("batch:")
    );
    expect(readBatchKey).toBe(false);
    expect(h.db.apiKey.findMany).toHaveBeenCalled();
  });

  it("M3 fail-safe: skips when Redis is clean but BatchRun.halted is set in the DB (frozen-ledger fallback)", async () => {
    // Simulate a prior ledger-write failure: the Redis flag never got set and
    // spend reads as 0 — but onComplete durably halted the batch in Postgres.
    h.redis.get.mockResolvedValue(null); // :spent and :halted both absent
    h.db.batchRun.findUnique.mockResolvedValue({ halted: true });

    await processAgentJob(
      makeJob({ ...BASE, batchId: "batch1", batchBudgetCapUsd: 10 })
    );

    expect(h.db.agentSession.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ status: "skipped" }),
    });
    // Orchestrator never built → provider never called → nothing spent.
    expect(h.db.apiKey.findMany).not.toHaveBeenCalled();
    expect(h.redis.incrbyfloat).not.toHaveBeenCalled();
  });
});

describe("processAgentJob — pre-orchestrator failure marks the session terminal (M4)", () => {
  it("flips a still-non-terminal session to 'failed' when the orchestrator build throws (no API key)", async () => {
    // Under cap + not halted → the guard lets the child through, but the
    // orchestrator build throws downstream (no API keys). That throw is BEFORE
    // onError is wired, so without M4 the session would stay 'queued'.
    h.redis.get.mockImplementation((key: string) =>
      Promise.resolve(key.endsWith(":spent") ? "2" : null)
    );

    await expect(
      processAgentJob(
        makeJob({ ...BASE, batchId: "batch1", batchBudgetCapUsd: 10 })
      )
    ).rejects.toBeTruthy();

    // Best-effort terminal mark: updateMany, filtered to non-terminal rows only
    // (idempotent + race-safe — never clobbers completed/skipped/cancelled).
    expect(h.db.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: { in: ["queued", "running"] } },
      data: expect.objectContaining({ status: "failed" }),
    });
  });

  it("marks a non-batch session 'failed' too (standalone pre-orchestrator throw)", async () => {
    h.redis.get.mockResolvedValue(null);

    await expect(processAgentJob(makeJob({ ...BASE }))).rejects.toBeTruthy();

    expect(h.db.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: { in: ["queued", "running"] } },
      data: expect.objectContaining({ status: "failed" }),
    });
  });
});
