import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { AgentJobData } from "@/lib/queue/agent-queue";
import type { BatchDigestJobData } from "@/lib/queue/batch-flow";

/**
 * Batch-lifecycle test (BATCH-SPEC build step 11). A mostly-MOCKED integration
 * test that walks ONE batch through its three real phases, asserting the seams
 * the per-component unit suites do not tie together:
 *
 *   (a) FAN-OUT  — `enqueueBatchFlow` creates the BatchRun + N child AgentSession
 *       rows (each with `batchId` set + jobId = sessionId dedup) and hands N
 *       children (on the existing `agent-sessions` queue) plus ONE fan-in parent
 *       (on the new `batch-digest` queue) to FlowProducer, every child carrying
 *       the aggregate `batchId` + finite `batchBudgetCapUsd`.
 *
 *   (b) CAP-SKIP — the pure gate `shouldRunBatchChild` AND the worker guard at
 *       the top of `processAgentJob` both refuse a child once the mocked Redis
 *       ledger shows `spent >= cap`: the child is marked 'skipped' and RETURNS
 *       before the orchestrator is built (never re-fetches keys, never spends).
 *
 *   (c) DIGEST   — `processBatchDigestJob` reads the persisted child rows + the
 *       Redis ledger, aggregates findings, surfaces the skipped child, sets the
 *       terminal BatchRun status/haltReason, and fires the morning notification.
 *
 * Redis (in-memory Map), Prisma, and BullMQ (FlowProducer/Queue) are mocked.
 * The pure money-path invariant itself is exhaustively covered in
 * batch-budget.test.ts (U1); this test asserts the WIRING between the pieces.
 *
 * NOTE: a live overnight-scale run (~24 children against real Redis + the real
 * worker) is still REQUIRED before shipping — the concurrency-2 completion-time
 * overshoot window and lock-renewal-under-long-pass double-spend risk
 * (BATCH-SPEC §4.5, §3.6, §8) cannot be exercised by a mocked unit test.
 */

// ── In-memory Redis ledger (shared by guard + digest, reset per test) ────────
const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  const redis = {
    store,
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, val: string) => {
      store.set(key, val);
      return Promise.resolve("OK");
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    incr: vi.fn(),
    incrbyfloat: vi.fn(),
    publish: vi.fn(),
    rpush: vi.fn(),
    expire: vi.fn(),
    disconnect: vi.fn(),
  };

  // FlowProducer.add capture — the fan-out tree the batch hands to BullMQ.
  const flowAdd = vi.fn((_flow: unknown) =>
    Promise.resolve({ job: { id: "parent-job-1" } })
  );

  return {
    redis,
    flowAdd,
    db: {
      // Fan-out (enqueueBatchFlow)
      batchRun: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      agentSession: {
        createMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
      // Digest reads
      editFinding: { findMany: vi.fn() },
      chapter: { findMany: vi.fn() },
      bookNotification: { create: vi.fn() },
      // Worker-guard downstream (never reached on the skip path)
      apiKey: { findMany: vi.fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/connection", () => ({
  createRedisConnection: () => h.redis,
  getAppConnection: () => h.redis,
}));
vi.mock("bullmq", () => {
  class FlowProducer {
    add(flow: unknown) {
      return h.flowAdd(flow);
    }
  }
  // agent-queue.ts instantiates `new Queue(...)` at module load; agent-worker
  // extends UnrecoverableError. Provide both so the real modules import cleanly.
  class Queue {
    add() {
      return Promise.resolve({});
    }
    getJob() {
      return Promise.resolve(null);
    }
    close() {
      return Promise.resolve();
    }
  }
  class Worker {}
  class UnrecoverableError extends Error {}
  return { FlowProducer, Queue, Worker, UnrecoverableError };
});

import { enqueueBatchFlow, type BatchChildPayload } from "@/lib/queue/batch-flow";
import { processAgentJob } from "@/lib/queue/agent-worker";
import { processBatchDigestJob } from "@/lib/queue/batch-digest";
import { shouldRunBatchChild } from "@/lib/agents/batch-budget";

const BATCH_ID = "batch-1";
const BOOK_ID = "book-1";
const USER_ID = "user-1";
const CAP = 10;

/** Build a valid (workflow × chapter) child payload (route.ts construction). */
function childPayload(
  workflowId: string,
  agentType: string,
  chapterNumber?: number
): BatchChildPayload {
  return {
    bookId: BOOK_ID,
    userId: USER_ID,
    workflowId,
    agentType,
    chapterNumber,
    coachRegistryId: "anthropic/sonnet",
    coachModelId: "claude-sonnet",
    providerKey: "anthropic",
    language: "en",
    bookName: "The Salt Letters",
    sessionCostLimit: 5,
    serverCeilingMs: 60_000,
    isConversational: false,
  };
}

function makeAgentJob(data: Partial<AgentJobData>): Job<AgentJobData> {
  return { data } as unknown as Job<AgentJobData>;
}

function makeDigestJob(): Job<BatchDigestJobData> {
  return { data: { batchId: BATCH_ID } } as unknown as Job<BatchDigestJobData>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.redis.store.clear();
  h.db.batchRun.create.mockResolvedValue({ id: BATCH_ID, bookId: BOOK_ID });
  h.db.batchRun.update.mockResolvedValue({});
  // Default: no durable DB halt (the guard reads this as a fail-safe fallback).
  // Phase (c) digest tests override findUnique with the full BatchRun row.
  h.db.batchRun.findUnique.mockResolvedValue(null);
  h.db.agentSession.createMany.mockResolvedValue({ count: 4 });
  h.db.agentSession.update.mockResolvedValue({});
  h.db.agentSession.updateMany.mockResolvedValue({ count: 0 });
  h.db.apiKey.findMany.mockResolvedValue([]);
});

// ── Phase (a): fan-out ───────────────────────────────────────────────────────
describe("batch lifecycle — (a) fan-out", () => {
  it("creates the BatchRun + N child sessions (batchId set) and one fan-in parent flow", async () => {
    // dev-edit + line-edit × chapters 1–2 = 4 children
    const children: BatchChildPayload[] = [
      childPayload("dev-edit", "dev-editor", 1),
      childPayload("dev-edit", "dev-editor", 2),
      childPayload("line-edit", "line-editor", 1),
      childPayload("line-edit", "line-editor", 2),
    ];

    const result = await enqueueBatchFlow({
      userId: USER_ID,
      bookId: BOOK_ID,
      workflowIds: ["dev-edit", "line-edit"],
      chapterStart: 1,
      chapterEnd: 2,
      budgetCapUsd: CAP,
      scheduledFor: null,
      children,
    });

    // BatchRun row created queued, with the full child count.
    expect(h.db.batchRun.create).toHaveBeenCalledTimes(1);
    const batchData = h.db.batchRun.create.mock.calls[0][0].data;
    expect(batchData).toMatchObject({
      userId: USER_ID,
      bookId: BOOK_ID,
      status: "queued",
      budgetCapUsd: CAP,
      childCount: 4,
    });

    // N child AgentSession rows — each linked to the batch, jobId == row id.
    expect(h.db.agentSession.createMany).toHaveBeenCalledTimes(1);
    const rows = h.db.agentSession.createMany.mock.calls[0][0].data as Array<{
      id: string;
      batchId: string;
      jobId: string;
      status: string;
    }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.batchId === BATCH_ID)).toBe(true);
    expect(rows.every((r) => r.jobId === r.id)).toBe(true);
    expect(rows.every((r) => r.status === "queued")).toBe(true);
    // Distinct session ids (no dedup collision).
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);

    // FlowProducer: parent on batch-digest, N children on agent-sessions, each
    // carrying the aggregate batchId + the finite cap.
    expect(h.flowAdd).toHaveBeenCalledTimes(1);
    const flow = h.flowAdd.mock.calls[0][0] as {
      queueName: string;
      data: BatchDigestJobData;
      opts: { delay: number };
      children: Array<{
        queueName: string;
        data: AgentJobData;
        opts: {
          jobId: string;
          delay?: number;
          ignoreDependencyOnFailure?: boolean;
        };
      }>;
    };
    expect(flow.queueName).toBe("batch-digest");
    expect(flow.data.batchId).toBe(BATCH_ID);
    // Parent digest is a pure fan-in — NEVER carries a schedule delay.
    expect(flow.opts.delay).toBe(0);
    expect(flow.children).toHaveLength(4);
    expect(flow.children.every((c) => c.queueName === "agent-sessions")).toBe(true);
    expect(flow.children.every((c) => c.data.batchId === BATCH_ID)).toBe(true);
    expect(flow.children.every((c) => c.data.batchBudgetCapUsd === CAP)).toBe(true);
    // jobId dedup mirrors the sessionId (standard-path invariant).
    expect(flow.children.every((c) => c.opts.jobId === c.data.sessionId)).toBe(true);
    // HIGH #2: every child ignores its failure as a parent dependency, so an
    // exhausted-attempts child can't wedge the fan-in digest forever.
    expect(
      flow.children.every((c) => c.opts.ignoreDependencyOnFailure === true)
    ).toBe(true);
    // Running "now" (scheduledFor null) → children carry NO delay.
    expect(flow.children.every((c) => c.opts.delay === undefined)).toBe(true);

    expect(result).toMatchObject({
      batchId: BATCH_ID,
      childCount: 4,
      parentJobId: "parent-job-1",
    });
  });

  it("HIGH #1: puts the one-shot schedule delay on the CHILDREN, not the fan-in parent", async () => {
    const scheduledFor = new Date(Date.now() + 6 * 60 * 60 * 1000); // ~2am, 6h out

    await enqueueBatchFlow({
      userId: USER_ID,
      bookId: BOOK_ID,
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 2,
      budgetCapUsd: CAP,
      scheduledFor,
      children: [
        childPayload("dev-edit", "dev-editor", 1),
        childPayload("dev-edit", "dev-editor", 2),
      ],
    });

    const flow = h.flowAdd.mock.calls[0][0] as {
      opts: { delay: number };
      children: Array<{ opts: { delay?: number } }>;
    };

    // Parent stays a pure fan-in (delay 0) — a parent delay would be inoperative
    // (children fan out + SPEND immediately) since parents don't gate children.
    expect(flow.opts.delay).toBe(0);
    // The delay actually defers the passes: every child carries a positive delay
    // (~6h). This is what makes a scheduled batch's spend truly deferred.
    expect(flow.children).toHaveLength(2);
    expect(
      flow.children.every(
        (c) => typeof c.opts.delay === "number" && c.opts.delay > 0
      )
    ).toBe(true);
  });

  it("rejects a non-finite cap before creating anything (Infinity->null serialization trap)", async () => {
    await expect(
      enqueueBatchFlow({
        userId: USER_ID,
        bookId: BOOK_ID,
        workflowIds: ["dev-edit"],
        chapterStart: 1,
        chapterEnd: 1,
        budgetCapUsd: Infinity,
        children: [childPayload("dev-edit", "dev-editor", 1)],
      })
    ).rejects.toThrow(/finite/i);
    expect(h.db.batchRun.create).not.toHaveBeenCalled();
    expect(h.flowAdd).not.toHaveBeenCalled();
  });
});

// ── Phase (b): pre-child cap-skip guard ──────────────────────────────────────
describe("batch lifecycle — (b) cap-skip guard", () => {
  const CHILD: Partial<AgentJobData> = {
    ...childPayload("dev-edit", "dev-editor", 1),
    sessionId: "child-ch1-dev",
    batchId: BATCH_ID,
    batchBudgetCapUsd: CAP,
  };

  it("pure gate: shouldRunBatchChild flips false exactly when the ledger reaches cap", () => {
    expect(shouldRunBatchChild(2, CAP, false)).toBe(true); // under cap
    expect(shouldRunBatchChild(CAP, CAP, false)).toBe(false); // at cap
    expect(shouldRunBatchChild(CAP + 0.5, CAP, false)).toBe(false); // over cap
    expect(shouldRunBatchChild(0, CAP, true)).toBe(false); // breaker halted
  });

  it("worker guard: marks the child 'skipped' and returns BEFORE building the orchestrator once spent >= cap", async () => {
    // Ledger says the batch has already spent past the cap.
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "10.50");

    await processAgentJob(makeAgentJob(CHILD));

    expect(h.db.agentSession.update).toHaveBeenCalledWith({
      where: { id: "child-ch1-dev" },
      data: expect.objectContaining({ status: "skipped" }),
    });
    // Orchestrator never built → keys never re-fetched → provider never called.
    expect(h.db.apiKey.findMany).not.toHaveBeenCalled();
    expect(h.redis.incrbyfloat).not.toHaveBeenCalled();
    // Consulted exactly the batch ledger keys.
    const ledgerReads = h.redis.get.mock.calls.map((c) => String(c[0]));
    expect(ledgerReads).toContain(`batch:${BATCH_ID}:spent`);
    expect(ledgerReads).toContain(`batch:${BATCH_ID}:halted`);
  });

  it("worker guard: lets an under-cap child through to the orchestrator build", async () => {
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "2.00");

    // No API keys configured → orchestrator build throws downstream; we only
    // assert the guard let the child THROUGH (did not skip it, DID fetch keys).
    await expect(processAgentJob(makeAgentJob(CHILD))).rejects.toBeTruthy();

    expect(h.db.apiKey.findMany).toHaveBeenCalled();
    const skipped = h.db.agentSession.update.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "skipped"
    );
    expect(skipped).toBe(false);
  });

  it("D-96: flips an admitted under-cap child to 'running' before building the orchestrator", async () => {
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "2.00");
    // No API keys → the orchestrator build throws downstream; we assert only
    // that the queued→running flip fired for THIS child, so a mid-run poll no
    // longer shows an actively-executing child as 'queued'. Terminal handling
    // (onComplete/onError/catch) is unchanged.
    await expect(processAgentJob(makeAgentJob(CHILD))).rejects.toBeTruthy();
    const runningFlip = h.db.agentSession.update.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "running"
    );
    expect(runningFlip).toBeDefined();
    expect((runningFlip![0] as { where: { id: string } }).where.id).toBe(
      "child-ch1-dev"
    );
  });
});

// ── Phase (c): fan-in digest ─────────────────────────────────────────────────
describe("batch lifecycle — (c) digest aggregation", () => {
  it("aggregates findings, surfaces the skipped child, and writes the terminal halted status + notification", async () => {
    // The cap was hit mid-batch: 2 children completed, 1 was skipped by the guard.
    h.db.batchRun.findUnique.mockResolvedValue({
      id: BATCH_ID,
      bookId: BOOK_ID,
      userId: USER_ID,
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 3,
      budgetCapUsd: CAP,
      status: "running",
      halted: false,
    });
    h.db.agentSession.findMany.mockResolvedValue([
      { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 5 },
      { id: "s2", status: "completed", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: 5.5 },
      { id: "s3", status: "skipped", chapterNumber: 3, workflowId: "dev-edit", actualCostUsd: null },
    ]);
    h.db.editFinding.findMany.mockResolvedValue([
      { severity: "critical", category: "pacing", chapterNumber: 1 },
      { severity: "suggestion", category: "prose", chapterNumber: 1 },
      { severity: "suggestion", category: "dialogue", chapterNumber: 2 },
    ]);
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, status: "drafted", betaGate: null },
      { chapterNumber: 2, status: "drafted", betaGate: null },
      { chapterNumber: 3, status: "drafted", betaGate: null },
    ]);
    // Redis ledger: cap reached → halted flag set, spend at cap.
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "10.50");
    h.redis.store.set(`batch:${BATCH_ID}:halted`, "1");
    h.redis.store.set(`batch:${BATCH_ID}:failures`, "0");

    await processBatchDigestJob(makeDigestJob());

    // Terminal BatchRun status written: halted / budget_cap, with counts.
    expect(h.db.batchRun.update).toHaveBeenCalledTimes(1);
    const upd = h.db.batchRun.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: BATCH_ID });
    expect(upd.data).toMatchObject({
      status: "halted",
      haltReason: "budget_cap",
      halted: true,
      spentUsd: 10.5,
      completedCount: 2,
      failedCount: 0,
    });

    // Digest surfaces the skipped child + the aggregated findings.
    const digest = upd.data.digest as {
      passes: { total: number; completed: number; skipped: number };
      findings: { total: number; bySeverity: Record<string, number> };
      statusAutoAdvanceSuppressed: boolean;
    };
    expect(digest.passes).toMatchObject({ total: 3, completed: 2, skipped: 1 });
    expect(digest.findings.total).toBe(3);
    expect(digest.findings.bySeverity).toEqual({ critical: 1, suggestion: 2 });
    // v1: batch never auto-advances chapter status (owner decision #7).
    expect(digest.statusAutoAdvanceSuppressed).toBe(true);

    // One morning notification, mentioning the skip + spend/cap.
    expect(h.db.bookNotification.create).toHaveBeenCalledTimes(1);
    const note = h.db.bookNotification.create.mock.calls[0][0].data;
    expect(note).toMatchObject({
      bookId: BOOK_ID,
      userId: USER_ID,
      type: "pipeline_complete",
      priority: "high", // halted → high priority
    });
    expect(note.message).toContain("skipped");
    expect(note.message).toContain("$10.50");
  });

  it("Z11: a Redis ledger read failure falls back to the DB actualCostUsd sum, not $0", async () => {
    h.db.batchRun.findUnique.mockResolvedValue({
      id: BATCH_ID,
      bookId: BOOK_ID,
      userId: USER_ID,
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 2,
      budgetCapUsd: CAP,
      status: "running",
      halted: false,
      spentUsd: 0,
    });
    h.db.agentSession.findMany.mockResolvedValue([
      { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 0.05 },
      { id: "s2", status: "completed", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: 0.04 },
    ]);
    h.db.editFinding.findMany.mockResolvedValue([]);
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, status: "drafted", betaGate: null },
      { chapterNumber: 2, status: "drafted", betaGate: null },
    ]);
    // Simulate a Redis hiccup on the ledger read (3 gets in Promise.all).
    h.redis.get
      .mockRejectedValueOnce(new Error("redis down"))
      .mockRejectedValueOnce(new Error("redis down"))
      .mockRejectedValueOnce(new Error("redis down"));

    await processBatchDigestJob(makeDigestJob());

    const upd = h.db.batchRun.update.mock.calls[0][0];
    // Pre-fix wrote spentUsd: 0 (ledger's error default); the fix falls back to
    // the persisted per-session sum 0.05 + 0.04 = 0.09.
    expect(upd.data.spentUsd).toBeCloseTo(0.09, 5);
    expect(upd.data.spentUsd).not.toBe(0);
  });

  it("a clean run (no skips, under cap) writes status 'done' and a normal-priority notification", async () => {
    h.db.batchRun.findUnique.mockResolvedValue({
      id: BATCH_ID,
      bookId: BOOK_ID,
      userId: USER_ID,
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 2,
      budgetCapUsd: CAP,
      status: "running",
      halted: false,
    });
    h.db.agentSession.findMany.mockResolvedValue([
      { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 2 },
      { id: "s2", status: "completed", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: 2 },
    ]);
    h.db.editFinding.findMany.mockResolvedValue([]);
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, status: "drafted", betaGate: null },
      { chapterNumber: 2, status: "drafted", betaGate: null },
    ]);
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "4.00");

    await processBatchDigestJob(makeDigestJob());

    const upd = h.db.batchRun.update.mock.calls[0][0];
    expect(upd.data).toMatchObject({
      status: "done",
      haltReason: null,
      halted: false,
      completedCount: 2,
    });
    const note = h.db.bookNotification.create.mock.calls[0][0].data;
    expect(note.priority).toBe("normal");
  });

  it("D-98: a budget-cap halt is titled a halt (not 'complete') and names it in the message", async () => {
    h.db.batchRun.findUnique.mockResolvedValue({
      id: BATCH_ID,
      bookId: BOOK_ID,
      userId: USER_ID,
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 3,
      budgetCapUsd: CAP,
      status: "running",
      halted: false,
    });
    h.db.agentSession.findMany.mockResolvedValue([
      { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 5 },
      { id: "s2", status: "completed", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: 5.5 },
      { id: "s3", status: "skipped", chapterNumber: 3, workflowId: "dev-edit", actualCostUsd: null },
    ]);
    h.db.editFinding.findMany.mockResolvedValue([]);
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, status: "drafted", betaGate: null },
      { chapterNumber: 2, status: "drafted", betaGate: null },
      { chapterNumber: 3, status: "drafted", betaGate: null },
    ]);
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "10.50");
    h.redis.store.set(`batch:${BATCH_ID}:halted`, "1");

    await processBatchDigestJob(makeDigestJob());

    const note = h.db.bookNotification.create.mock.calls[0][0].data;
    // Before the fix every terminal digest was titled "Overnight batch complete"
    // and the message never named the halt — a budget-cap stop read as clean.
    expect(note.title).not.toBe("Overnight batch complete");
    expect(note.title.toLowerCase()).toContain("halt");
    expect(note.message.toLowerCase()).toContain("halt");
    // The spend figure itself must be unchanged (effectiveSpent, as-is).
    expect(note.message).toContain("$10.50");
  });

  it("D-122: digest + notification count only writer-visible findings (gate-rejected excluded)", async () => {
    h.db.batchRun.findUnique.mockResolvedValue({
      id: BATCH_ID,
      bookId: BOOK_ID,
      userId: USER_ID,
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 1,
      budgetCapUsd: CAP,
      status: "running",
      halted: false,
      spentUsd: 0,
    });
    h.db.agentSession.findMany.mockResolvedValue([
      { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 1 },
    ]);
    // 5 real findings the writer will see + 2 auto-rejected by the
    // CreateFinding validation gate (persisted as rejection analytics only).
    h.db.editFinding.findMany.mockResolvedValue([
      { severity: "critical", category: "pacing", chapterNumber: 1, status: "pending" },
      { severity: "important", category: "dialogue", chapterNumber: 1, status: "pending" },
      { severity: "suggestion", category: "prose", chapterNumber: 1, status: "pending" },
      { severity: "suggestion", category: "prose", chapterNumber: 1, status: "pending" },
      { severity: "suggestion", category: "prose", chapterNumber: 1, status: "pending" },
      { severity: "critical", category: "pacing", chapterNumber: 1, status: "rejected" },
      { severity: "critical", category: "pacing", chapterNumber: 1, status: "rejected" },
    ]);
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, status: "drafted", betaGate: null },
    ]);
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "1.00");

    await processBatchDigestJob(makeDigestJob());

    // The digest must read the status column so it can tell the two apart.
    const findingSelect = h.db.editFinding.findMany.mock.calls[0][0].select as
      | Record<string, boolean>
      | undefined;
    expect(findingSelect?.status).toBe(true);

    const upd = h.db.batchRun.update.mock.calls[0][0];
    const digest = upd.data.digest as {
      findings: { total: number; suppressed: number; bySeverity: Record<string, number> };
    };
    // Pre-fix this read 7 — the exact over-claim all three judges filed.
    expect(digest.findings.total).toBe(5);
    expect(digest.findings.suppressed).toBe(2);
    expect(digest.findings.bySeverity).toEqual({
      critical: 1,
      important: 1,
      suggestion: 3,
    });

    // The morning notification says 5, and NAMES the discarded rows rather
    // than silently dropping them.
    const note = h.db.bookNotification.create.mock.calls[0][0].data;
    expect(note.message).toContain("5 findings");
    expect(note.message).not.toContain("7 findings");
    expect(note.message).toContain("2 discarded");
  });

  it("D-98: a sub-cent budget cap renders with precision, not '$0.00 cap'", async () => {
    h.db.batchRun.findUnique.mockResolvedValue({
      id: BATCH_ID,
      bookId: BOOK_ID,
      userId: USER_ID,
      workflowIds: ["dev-edit"],
      chapterStart: 1,
      chapterEnd: 1,
      budgetCapUsd: 0.005,
      status: "running",
      halted: false,
      spentUsd: 0,
    });
    h.db.agentSession.findMany.mockResolvedValue([
      { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 0.002 },
    ]);
    h.db.editFinding.findMany.mockResolvedValue([]);
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, status: "drafted", betaGate: null },
    ]);
    h.redis.store.set(`batch:${BATCH_ID}:spent`, "0.002");

    await processBatchDigestJob(makeDigestJob());

    const note = h.db.bookNotification.create.mock.calls[0][0].data;
    // toFixed(2) collapsed a $0.005 cap to "$0.00 cap" — show the real cap.
    expect(note.message).toContain("$0.005");
    expect(note.message).not.toContain("/ $0.00 cap");
  });
});
