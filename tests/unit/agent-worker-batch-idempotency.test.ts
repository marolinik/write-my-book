import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { AgentJobData } from "@/lib/queue/agent-queue";
import type { AgentResult, AgentSpawnOptions } from "@/lib/agents/types";

/**
 * Batch money-path idempotency + breaker wiring (Z8 + D-62).
 *
 * Z8 — a stalled/crashed batch child that BullMQ re-runs must bill AT MOST ONCE.
 * The ledger increment + UsageRecord create are keyed on a Redis marker
 * `batch:{id}:counted:{sessionId}` claimed with SET NX (atomic). `sessionId` ==
 * BullMQ `jobId` is stable across attempts, so it is the attempt-independent
 * idempotency key. This suite proves:
 *   - an already-counted child short-circuits at the pre-child guard (no key
 *     re-fetch, no orchestrator, no second ledger/UsageRecord write),
 *   - running the SAME child twice records spend + UsageRecord exactly once.
 *
 * D-62 — a provider outage ends the loop by RESOLVING success:false (D-36), it
 * never THROWS, so the thrown-error breaker path never fires for it. Resolved
 * provider-failure children must count toward the breaker exactly like thrown
 * ones; a genuine success resets the consecutive streak; N consecutive resolved
 * failures trip `halted` so the pre-child guard skips the rest.
 *
 * Redis is a store-backed in-memory mock that HONORS SET NX so idempotency is
 * exercised for real. Prisma + the orchestrator are mocked; the fake
 * orchestrator resolves immediately via onComplete with a scripted result.
 */

const h = vi.hoisted(() => {
  const store = new Map<string, string>();
  const redis = {
    store,
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    // Honor SET NX: return null (not "OK") when the key already exists and NX
    // was requested — this is what makes the idempotency marker atomic.
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
    fakeResult: { current: null as AgentResult | null },
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/connection", () => ({
  createRedisConnection: () => h.redis,
  getAppConnection: () => h.redis,
}));
vi.mock("@/lib/encryption", () => ({
  decryptApiKey: () => "sk-test",
}));
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
vi.mock("@/lib/agents/orchestrator", () => ({
  AgentOrchestrator: class {
    constructor(_opts: unknown) {}
    cancel() {}
    async runAgent(spawn: AgentSpawnOptions): Promise<AgentResult> {
      const result = h.fakeResult.current;
      if (!result) throw new Error("fakeResult not set");
      await spawn.onComplete(result);
      return result;
    }
  },
}));

import { processAgentJob } from "@/lib/queue/agent-worker";

function makeJob(data: Partial<AgentJobData>): Job<AgentJobData> {
  return {
    data,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<AgentJobData>;
}

const BASE: Partial<AgentJobData> = {
  sessionId: "child-1",
  bookId: "b1",
  userId: "u1",
  workflowId: "line-edit",
  agentType: "line-editor",
  coachRegistryId: "anthropic/sonnet",
  coachModelId: "claude",
  providerKey: "openrouter",
  language: "en",
  bookName: "Book",
  sessionCostLimit: 5,
  serverCeilingMs: 60_000,
  isConversational: false,
  batchId: "b-batch",
  batchBudgetCapUsd: 100,
};

function failedResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    success: false,
    tokensInput: 0,
    tokensOutput: 0,
    documentIds: [],
    sessionId: "child-1",
    endReason: "error",
    cancelled: false,
    ...overrides,
  };
}

function completedResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    success: true,
    tokensInput: 100,
    tokensOutput: 200,
    documentIds: [],
    sessionId: "child-1",
    endReason: "natural",
    cancelled: false,
    ...overrides,
  };
}

function incrbyfloatCallsFor(key: string): number {
  return h.redis.incrbyfloat.mock.calls.filter((c) => String(c[0]) === key)
    .length;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.redis.store.clear();
  h.fakeResult.current = null;
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

// ── Z8: idempotent billing ───────────────────────────────────────────────────
describe("processAgentJob — Z8 idempotent batch spend ledger", () => {
  it("records spend + UsageRecord exactly once when the SAME child is re-run (stalled retry)", async () => {
    h.fakeResult.current = completedResult({ tokensInput: 50, tokensOutput: 60 });

    // Attempt 1: runs the orchestrator and records spend.
    await processAgentJob(makeJob({ ...BASE }));
    // Attempt 2 (stalled re-run, same sessionId == jobId): must NOT re-bill.
    await processAgentJob(makeJob({ ...BASE }));

    // Ledger increment + UsageRecord happened exactly once across both attempts.
    expect(incrbyfloatCallsFor("batch:b-batch:spent")).toBe(1);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
    // The idempotency marker was claimed for this child.
    expect(h.redis.store.get("batch:b-batch:counted:child-1")).toBe("1");
  });

  it("short-circuits at the pre-child guard when the counted marker already exists (no re-spend, no orchestrator)", async () => {
    // A prior attempt already recorded this child's spend.
    h.redis.store.set("batch:b-batch:counted:child-1", "1");
    h.fakeResult.current = completedResult();

    await processAgentJob(makeJob({ ...BASE }));

    // Orchestrator never built → keys never re-fetched → provider never called.
    expect(h.db.apiKey.findMany).not.toHaveBeenCalled();
    expect(h.redis.incrbyfloat).not.toHaveBeenCalled();
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    // Idempotently terminalized, filtered to non-terminal rows only.
    expect(h.db.agentSession.updateMany).toHaveBeenCalledWith({
      where: { id: "child-1", status: { in: ["queued", "running"] } },
      data: expect.objectContaining({ status: "failed" }),
    });
    expect(h.redis.disconnect).toHaveBeenCalled();
  });

  it("a first, un-counted child still records its spend once (no regression to D-36 partial-spend honesty)", async () => {
    h.fakeResult.current = failedResult({ tokensInput: 7, tokensOutput: 3 });

    await processAgentJob(makeJob({ ...BASE }));

    // Provider-failed child still rolls its real spend into the ledger — once.
    expect(incrbyfloatCallsFor("batch:b-batch:spent")).toBe(1);
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });
});

// ── D-62: breaker counts resolved provider failures ──────────────────────────
describe("processAgentJob — D-62 breaker counts RESOLVED provider failures", () => {
  it("a resolved provider-failure child increments the consecutive + total breaker counters", async () => {
    h.fakeResult.current = failedResult({ sessionId: "child-1" });

    await processAgentJob(makeJob({ ...BASE, sessionId: "child-1" }));

    expect(h.redis.store.get("batch:b-batch:consecutive")).toBe("1");
    expect(h.redis.store.get("batch:b-batch:failures")).toBe("1");
    // Not yet at threshold → not halted.
    expect(h.redis.store.get("batch:b-batch:halted")).toBeUndefined();
  });

  it("N consecutive resolved provider-failure children trip `halted` (then the guard skips the rest)", async () => {
    // 3 distinct failed children (default BATCH_BREAKER_CONSECUTIVE_FAILURES).
    for (const id of ["c1", "c2", "c3"]) {
      h.fakeResult.current = failedResult({ sessionId: id });
      await processAgentJob(makeJob({ ...BASE, sessionId: id }));
    }

    expect(h.redis.store.get("batch:b-batch:consecutive")).toBe("3");
    expect(h.redis.store.get("batch:b-batch:halted")).toBe("1");

    // A 4th child now short-circuits at the guard as 'skipped' (halted).
    h.fakeResult.current = failedResult({ sessionId: "c4" });
    h.db.apiKey.findMany.mockClear();
    await processAgentJob(makeJob({ ...BASE, sessionId: "c4" }));
    expect(h.db.agentSession.update).toHaveBeenCalledWith({
      where: { id: "c4" },
      data: expect.objectContaining({ status: "skipped" }),
    });
    expect(h.db.apiKey.findMany).not.toHaveBeenCalled();
  });

  it("a genuine success clears the consecutive streak but never trips the breaker", async () => {
    // Two failures build the streak to 2 …
    for (const id of ["c1", "c2"]) {
      h.fakeResult.current = failedResult({ sessionId: id });
      await processAgentJob(makeJob({ ...BASE, sessionId: id }));
    }
    expect(h.redis.store.get("batch:b-batch:consecutive")).toBe("2");

    // … a clean child resets it (del) so the batch is not halted by a transient
    // blip surrounded by good work.
    h.fakeResult.current = completedResult({ sessionId: "c3" });
    await processAgentJob(makeJob({ ...BASE, sessionId: "c3" }));

    expect(h.redis.store.get("batch:b-batch:consecutive")).toBeUndefined();
    expect(h.redis.store.get("batch:b-batch:halted")).toBeUndefined();
  });

  it("does NOT count the breaker for a re-run (idempotent): a re-billed child cannot double-trip", async () => {
    h.fakeResult.current = failedResult({ sessionId: "child-1" });

    await processAgentJob(makeJob({ ...BASE, sessionId: "child-1" }));
    await processAgentJob(makeJob({ ...BASE, sessionId: "child-1" }));

    // The second attempt short-circuits at the guard → breaker counted once.
    expect(h.redis.store.get("batch:b-batch:consecutive")).toBe("1");
    expect(h.redis.store.get("batch:b-batch:failures")).toBe("1");
  });

  it("a cancelled child leaves the breaker untouched (neither reset nor count)", async () => {
    // Build the streak to 1 with a real failure …
    h.fakeResult.current = failedResult({ sessionId: "c1" });
    await processAgentJob(makeJob({ ...BASE, sessionId: "c1" }));
    expect(h.redis.store.get("batch:b-batch:consecutive")).toBe("1");

    // … a user-cancelled child must not reset it (it did not succeed) nor count
    // it as a provider failure.
    h.fakeResult.current = failedResult({ sessionId: "c2", cancelled: true });
    await processAgentJob(makeJob({ ...BASE, sessionId: "c2" }));

    expect(h.redis.store.get("batch:b-batch:consecutive")).toBe("1");
    expect(h.redis.store.get("batch:b-batch:failures")).toBe("1");
  });
});

// ── M3: ledger-write failure fails safe (durable halt) WITHOUT dropping money ─
describe("processAgentJob — M3 ledger-write fail-safe", () => {
  it("marker-claim Redis write REJECTS → durable DB halt + STILL bills (fail-open, no silent skip)", async () => {
    h.fakeResult.current = completedResult({ tokensInput: 40, tokensOutput: 50 });

    // Redis rejects the atomic SET NX marker claim (e.g. maxmemory+noeviction).
    // The assignment `firstFinalize = (await set(...)) === "OK"` throws BEFORE it
    // can overwrite the `true` initializer, so firstFinalize stays true. Every
    // other key delegates to the store-backed base so the best-effort `:halted`
    // mirror behaves normally.
    const store = h.redis.store;
    const baseSet = (key: string, val: unknown, ...args: unknown[]) => {
      const nx = args.includes("NX");
      if (nx && store.has(key)) return Promise.resolve(null);
      store.set(key, String(val));
      return Promise.resolve("OK");
    };
    h.redis.set.mockImplementation(
      (key: string, val: unknown, ...args: unknown[]) => {
        if (key === "batch:b-batch:counted:child-1") {
          // Cast keeps the inferred union `Promise<null> | Promise<string>`
          // (a bare reject is Promise<never>, which collapses it and no longer
          // matches the mock's normalized signature).
          return Promise.reject(
            new Error("OOM command not allowed when used memory > 'maxmemory'")
          ) as Promise<string>;
        }
        return baseSet(key, val, ...args);
      }
    );

    try {
      await processAgentJob(makeJob({ ...BASE }));
    } finally {
      // Restore the store-backed impl — clearAllMocks() keeps implementations,
      // so a leaked reject would poison every later test's marker claim. Inline
      // arrow (not the bare const) so contextual typing accepts it.
      h.redis.set.mockImplementation((key, val, ...args) =>
        baseSet(key, val, ...args)
      );
    }

    // (a) M3 durable halt: a Redis-only guard would freeze `spent` at 0 and
    // admit every remaining child (cap DEFEATED), so the batch is halted in
    // Postgres with the honest reason the pre-child guard also reads.
    expect(h.db.batchRun.update).toHaveBeenCalledWith({
      where: { id: "b-batch" },
      data: { halted: true, haltReason: "ledger_write_failed" },
    });
    // (b) firstFinalize stayed true → the writer's real spend is NOT silently
    // dropped. Billing fails OPEN (records the UsageRecord), never a Z11-class
    // silent skip that would under-report the spend the provider already made.
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });
});
