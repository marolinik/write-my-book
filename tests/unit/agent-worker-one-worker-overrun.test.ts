import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { AgentJobData } from "@/lib/queue/agent-queue";
import type {
  AgentResult,
  AgentSpawnOptions,
  SharedCostTracker,
} from "@/lib/agents/types";

/**
 * ONE-WORKER OVERRUN PROOF — Gate 4 ("Money never overruns"), P4 Priya's
 * "one-worker rule" for the overnight/batch money-path (BullMQ Flows).
 *
 * P4's flagged invariant (GRADING-PROTOCOL §8 + TEST-PLAN Power step): a SINGLE
 * worker draining many queued batch children must not let aggregate spend run
 * away past the writer's dollar cap, and the ledger must be idempotent under a
 * stalled/crashed re-delivery of the same child.
 *
 * This harness drives the REAL `processAgentJob` money-path end-to-end on ONE
 * worker draining children SEQUENTIALLY (await each → models concurrency=1):
 *   - the pre-child guard (`shouldRunBatchChild` reading `batch:{id}:spent` /
 *     `:halted`),
 *   - the real onComplete ledger commit (`incrbyfloat batch:{id}:spent`) and its
 *     cap-halt (`spent >= cap → set batch:{id}:halted`),
 *   - the Z8 idempotency marker (`SET NX batch:{id}:counted:{sessionId}`).
 *
 * Only the orchestrator, DB, and LLM are mocked. Redis is a store-backed
 * in-memory mock that HONORS `SET NX` and `incrbyfloat`, so the ledger
 * accumulation, the halt-set, and the idempotency claim are all EXERCISED FOR
 * REAL. The mock orchestrator injects each child's scripted spend into the
 * SHARED cost tracker (the same object onComplete reads `cost` from), so the
 * ledger sees genuine per-child dollars.
 *
 * WHY THE NAIVE "spend never exceeds cap" IS NOT THE INVARIANT (see BATCH-SPEC
 * §4.5 / the Z9 audit): the ledger commits on child COMPLETION and the gate is
 * checked at dispatch, so the child that crosses the cap is admitted BEFORE its
 * spend lands — a bounded overshoot of at most one per-child cost on a single
 * sequential worker (`cap + maxPerChildCost`). The real guarantee this suite
 * pins is that spend is BOUNDED and the drain HALTS — it never runs away to the
 * unbounded sum of every queued child's cost.
 */

const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  const costBySession = new Map<string, number>();
  const redis = {
    store,
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    // Honor SET NX: return null (not "OK") when the key exists and NX was asked —
    // this is what makes the Z8 idempotency marker atomic under re-delivery.
    set: vi.fn((key: string, val: unknown, ...args: unknown[]) => {
      const nx = args.includes("NX");
      if (nx && store.has(key)) return Promise.resolve(null);
      store.set(key, String(val));
      return Promise.resolve("OK");
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    incr: vi.fn((key: string) => {
      const n = parseInt(store.get(key) ?? "0", 10) + 1;
      store.set(key, String(n));
      return Promise.resolve(n);
    }),
    incrbyfloat: vi.fn((key: string, by: unknown) => {
      const n = parseFloat(store.get(key) ?? "0") + Number(by);
      store.set(key, String(n));
      return Promise.resolve(String(n));
    }),
    publish: vi.fn().mockResolvedValue(1),
    rpush: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
  };
  return {
    redis,
    costBySession,
    db: {
      agentSession: { update: vi.fn(), updateMany: vi.fn() },
      batchRun: { findUnique: vi.fn(), update: vi.fn() },
      apiKey: { findMany: vi.fn() },
      book: { findFirst: vi.fn() },
      user: { findUnique: vi.fn() },
      usageRecord: { create: vi.fn() },
    },
    processPostSession: vi.fn(),
    createSessionBrief: vi.fn(),
    addUserMessage: vi.fn(),
    addAssistantMessage: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/connection", () => ({
  createRedisConnection: () => h.redis,
  getAppConnection: () => h.redis,
}));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: () => "sk-test" }));
vi.mock("@/lib/llm/cost-estimator", () => ({
  estimateWorkflowCost: () => ({ min: 0.1, max: 1 }),
}));
vi.mock("@/lib/llm", () => ({
  getModelDef: () => ({
    provider: "openrouter",
    modelId: "fake-model",
    tier: "sonnet",
  }),
  resolveProviderRoute: () => ({
    route: "direct",
    apiKey: "sk-test",
    baseURL: "https://example.invalid",
    effectiveModelId: "fake-model",
  }),
  resolveModelForRole: () => ({
    modelDef: { provider: "openrouter", modelId: "fake-model" },
    registryId: "openrouter/fake",
  }),
  mapAgentTypeToRole: () => "editor",
}));
vi.mock("@/lib/agents", () => ({
  getWorkflow: () => ({ id: "line-edit", primaryAgent: "line-editor" }),
  getAgentDefinition: () => ({ tools: [] }),
  addUserMessage: h.addUserMessage,
  addAssistantMessage: h.addAssistantMessage,
}));
vi.mock("@/lib/agents/post-session", () => ({
  processPostSession: h.processPostSession,
}));
vi.mock("@/lib/agents/session-brief", () => ({
  createSessionBrief: h.createSessionBrief,
}));

// Mock orchestrator that injects each child's scripted spend into the SHARED
// cost tracker (captured from the constructor opts) BEFORE resolving via
// onComplete — so the real onComplete ledger commit sees genuine dollars.
vi.mock("@/lib/agents/orchestrator", () => ({
  AgentOrchestrator: class {
    private tracker: SharedCostTracker;
    constructor(opts: { sharedCostTracker: SharedCostTracker }) {
      this.tracker = opts.sharedCostTracker;
    }
    cancel() {}
    async runAgent(spawn: AgentSpawnOptions): Promise<AgentResult> {
      const cost = h.costBySession.get(spawn.sessionId) ?? 0;
      // The real orchestrator accumulates spend into this shared object; onComplete
      // reads `sharedCostTracker.totalCostUsd` as the child's finalized cost.
      this.tracker.totalCostUsd += cost;
      this.tracker.totalInputTokens += 10;
      this.tracker.totalOutputTokens += 20;
      const result: AgentResult = {
        success: true,
        tokensInput: 10,
        tokensOutput: 20,
        documentIds: [],
        sessionId: spawn.sessionId,
        endReason: "natural",
        cancelled: false,
      };
      await spawn.onComplete(result);
      return result;
    }
  },
}));

import { processAgentJob } from "@/lib/queue/agent-worker";

const BATCH_ID = "batch-overrun";
const CAP_USD = 10;
const CHILD_COST = 3; // 4 children ($12) crosses a $10 cap; the 5th+ are skipped.
const CHILD_IDS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];

function makeChildJob(sessionId: string): Job<AgentJobData> {
  const data: Partial<AgentJobData> = {
    sessionId,
    bookId: "b1",
    userId: "u1",
    workflowId: "line-edit",
    agentType: "line-editor",
    coachRegistryId: "anthropic/sonnet",
    coachModelId: "claude",
    providerKey: "openrouter",
    language: "en",
    bookName: "Crown of Embers",
    sessionCostLimit: 5,
    serverCeilingMs: 60_000,
    isConversational: false,
    batchId: BATCH_ID,
    batchBudgetCapUsd: CAP_USD,
  };
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<AgentJobData>;
}

function spent(): number {
  return parseFloat(h.redis.store.get(`batch:${BATCH_ID}:spent`) ?? "0");
}
function incrbyfloatCount(): number {
  return h.redis.incrbyfloat.mock.calls.filter(
    (c) => String(c[0]) === `batch:${BATCH_ID}:spent`
  ).length;
}
function skippedIds(): string[] {
  return h.db.agentSession.update.mock.calls
    .filter(
      (c) =>
        (c[0] as { data?: { status?: string } })?.data?.status === "skipped"
    )
    .map((c) => (c[0] as { where: { id: string } }).where.id);
}

/** Drain the whole queue on ONE worker, strictly sequentially (concurrency=1). */
async function drainSequentially(ids: string[]): Promise<void> {
  for (const id of ids) {
    await processAgentJob(makeChildJob(id));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  h.redis.store.clear();
  h.costBySession.clear();
  for (const id of CHILD_IDS) h.costBySession.set(id, CHILD_COST);
  h.db.agentSession.update.mockResolvedValue({});
  h.db.agentSession.updateMany.mockResolvedValue({ count: 0 });
  h.db.batchRun.findUnique.mockResolvedValue(null);
  h.db.batchRun.update.mockResolvedValue({});
  h.db.apiKey.findMany.mockResolvedValue([
    { provider: "openrouter", encryptedKey: "enc", validatedAt: new Date() },
  ]);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", settings: null });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.usageRecord.create.mockResolvedValue({});
  h.processPostSession.mockResolvedValue({
    suggestedNext: [],
    findingsCreated: 0,
    statusAdvanced: false,
  });
});

describe("one-worker overrun — single worker draining N children over a $10 cap", () => {
  it("HALTS the drain once accumulated spend crosses the cap (cost-driven halt, no failures)", async () => {
    await drainSequentially(CHILD_IDS);

    // The cap-halt is tripped by ACCUMULATING COST — every child succeeded, so
    // this is NOT the breaker/failure path; it is onComplete's `spent >= cap`
    // branch (agent-worker.ts). No breaker counters were ever touched.
    expect(h.redis.store.get(`batch:${BATCH_ID}:halted`)).toBe("1");
    expect(h.redis.store.get(`batch:${BATCH_ID}:failures`)).toBeUndefined();
    expect(h.redis.store.get(`batch:${BATCH_ID}:consecutive`)).toBeUndefined();
  });

  it("bounds total committed spend (cap + at most ONE per-child overshoot) — money never runs away to the unbounded sum", async () => {
    await drainSequentially(CHILD_IDS);

    const sumIfAllRan = CHILD_IDS.length * CHILD_COST; // $24 — the runaway ceiling

    // The cap WAS crossed (this is not a no-op) …
    expect(spent()).toBeGreaterThanOrEqual(CAP_USD);
    // … but committed spend is bounded by cap + one per-child cost (the
    // documented single-sequential-worker overshoot bound, BATCH-SPEC §4.5) —
    // the naive "spend <= cap" does NOT hold ($12 on a $10 cap), by design:
    // the ledger commits on completion, so the cap-crossing child is admitted
    // BEFORE its spend lands. That is a bounded overshoot, not a runaway.
    expect(spent()).toBeLessThanOrEqual(CAP_USD + CHILD_COST);
    // … and CRUCIALLY it is far below the unbounded sum of every queued child:
    // the cap halted the drain instead of letting a single worker burn it all.
    expect(spent()).toBeLessThan(sumIfAllRan);
    // Concretely: c1..c4 run ($3 each → $12), c5..c8 are skipped.
    expect(spent()).toBeCloseTo(4 * CHILD_COST, 5);
  });

  it("REFUSES over-cap children (marks them 'skipped', never spends) instead of silently running them", async () => {
    await drainSequentially(CHILD_IDS);

    // Exactly the children after the cap crossed are skipped — never billed.
    expect(skippedIds()).toEqual(["c5", "c6", "c7", "c8"]);
    // Ledger committed exactly 4 times (only the running children) …
    expect(incrbyfloatCount()).toBe(4);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(4);
    // … and the 4 skipped children never re-fetched keys → never reached a
    // provider (a skip is a hard short-circuit BEFORE any spend can happen).
    expect(h.db.apiKey.findMany).toHaveBeenCalledTimes(4);
  });

  it("is idempotent under duplicate/stalled re-delivery mid-drain (same jobId twice → charged once)", async () => {
    // Run the first three (spend $9, still under cap, not halted).
    await drainSequentially(["c1", "c2", "c3"]);
    expect(spent()).toBeCloseTo(9, 5);
    const commitsBefore = incrbyfloatCount();

    // A stalled/crashed re-delivery of c2 (its spend was already committed on the
    // first attempt → the `counted:{sessionId}` marker exists). It MUST NOT
    // re-charge the writer's money.
    await processAgentJob(makeChildJob("c2"));

    expect(incrbyfloatCount()).toBe(commitsBefore); // no second commit for c2
    expect(spent()).toBeCloseTo(9, 5); // ledger unchanged
    // The re-delivered child short-circuited at the guard (no key re-fetch).
    expect(h.db.apiKey.findMany).toHaveBeenCalledTimes(3);
    // Idempotently terminalized, filtered to still-non-terminal rows only.
    expect(h.db.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: "c2", status: { in: ["queued", "running"] } },
      data: expect.objectContaining({ status: "failed" }),
    });
  });

  it("a crash AFTER commit does not double-spend on BullMQ retry (counted marker survives the re-run)", async () => {
    // c1 completes and commits its spend (marker set) …
    await processAgentJob(makeChildJob("c1"));
    expect(spent()).toBeCloseTo(3, 5);
    expect(h.redis.store.get(`batch:${BATCH_ID}:counted:c1`)).toBe("1");

    // … then the worker crashed post-commit and BullMQ re-ran the SAME job.
    // The marker (keyed on the attempt-independent sessionId==jobId) makes the
    // retry a no-op for money: the pre-child guard sees `counted:c1` and returns
    // before building the orchestrator.
    await processAgentJob(makeChildJob("c1"));

    expect(incrbyfloatCount()).toBe(1); // still one commit
    expect(spent()).toBeCloseTo(3, 5); // no double-spend
  });
});
