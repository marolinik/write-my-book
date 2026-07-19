import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { AgentJobData } from "@/lib/queue/agent-queue";
import type { AgentResult, AgentSpawnOptions } from "@/lib/agents/types";

/**
 * D-36 worker wiring: when the orchestrator resolves a session as FAILED
 * (provider outage → success:false via onComplete), the worker must be honest
 * end-to-end:
 *   - NO post-session processing (chapter status must NOT advance to
 *     line_edited on a run that did no work),
 *   - AgentSession.status = "failed" (the batch digest counts children purely
 *     by this column — Z11/D-17 money/report honesty),
 *   - Redis session:{id}:status = "failed", NOT "completed",
 *   - NO SSE "complete" publish (the loop already emitted the terminal
 *     "error"; a trailing "complete" would resurrect the session for
 *     replaying/polling clients — same contract as user-cancel),
 *   - token/cost accounting still persists (usage record + batch ledger),
 *   - the batch consecutive-failure streak is NOT cleared.
 *
 * A success:true companion run guards against over-correction.
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
    /** The AgentResult the fake orchestrator resolves with (set per test). */
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
// Fake orchestrator: immediately resolves via onComplete with the scripted
// result — the classification itself is covered by
// orchestrator-provider-failure.test.ts; here we test the WORKER's reaction.
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
  sessionId: "s1",
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
};

function failedResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    success: false,
    tokensInput: 0,
    tokensOutput: 0,
    documentIds: [],
    sessionId: "s1",
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
    sessionId: "s1",
    endReason: "natural",
    cancelled: false,
    ...overrides,
  };
}

/** All statuses the worker wrote to the session:{id}:status Redis key. */
function statusKeyWrites(): string[] {
  return h.redis.set.mock.calls
    .filter((c) => String(c[0]) === "session:s1:status")
    .map((c) => String(c[1]));
}

/** All SSE message types published to the session channel/list. */
function publishedTypes(): string[] {
  return h.redis.publish.mock.calls.map(
    (c) => (JSON.parse(String(c[1])) as { type: string }).type
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.fakeResult.current = null;
  h.redis.get.mockResolvedValue(null);
  h.redis.set.mockResolvedValue("OK");
  h.redis.incrbyfloat.mockResolvedValue("0.5");
  h.redis.expire.mockResolvedValue(1);
  h.redis.publish.mockResolvedValue(1);
  h.redis.rpush.mockResolvedValue(1);
  h.redis.del.mockResolvedValue(1);
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

describe("processAgentJob — failed session honesty (D-36)", () => {
  it("does NOT run post-session processing for a failed session (no chapter advance)", async () => {
    h.fakeResult.current = failedResult();

    await processAgentJob(makeJob({ ...BASE }));

    expect(h.processPostSession).not.toHaveBeenCalled();
  });

  it("persists AgentSession.status 'failed' with token/cost accounting intact", async () => {
    h.fakeResult.current = failedResult({ tokensInput: 7, tokensOutput: 3 });

    await processAgentJob(makeJob({ ...BASE }));

    expect(h.db.agentSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "failed" }),
      })
    );
    // Money honesty: the usage record is still written for a failed run.
    expect(h.db.usageRecord.create).toHaveBeenCalled();
  });

  it("sets Redis session status to 'failed' and never 'completed'", async () => {
    h.fakeResult.current = failedResult();

    await processAgentJob(makeJob({ ...BASE }));

    const writes = statusKeyWrites();
    expect(writes).toContain("failed");
    expect(writes).not.toContain("completed");
  });

  it("does NOT publish an SSE 'complete' for a failed session (no client resurrection)", async () => {
    h.fakeResult.current = failedResult();

    await processAgentJob(makeJob({ ...BASE }));

    expect(publishedTypes()).not.toContain("complete");
  });

  it("a failed BATCH child rolls its spend into the ledger, does NOT clear the streak, and COUNTS the breaker (D-62)", async () => {
    h.fakeResult.current = failedResult({ tokensInput: 7, tokensOutput: 3 });

    await processAgentJob(
      makeJob({ ...BASE, batchId: "batch1", batchBudgetCapUsd: 10 })
    );

    expect(h.redis.incrbyfloat).toHaveBeenCalledWith(
      "batch:batch1:spent",
      expect.any(Number)
    );
    expect(h.redis.del).not.toHaveBeenCalledWith("batch:batch1:consecutive");
    // D-62: a RESOLVED provider failure (success:false, never thrown) must count
    // toward the breaker — otherwise a batch spends through a total outage
    // because no child ever throws to reach the catch-block breaker path.
    expect(h.redis.incr).toHaveBeenCalledWith("batch:batch1:consecutive");
    expect(h.redis.incr).toHaveBeenCalledWith("batch:batch1:failures");
    // And it must not run post-session either (batch or not).
    expect(h.processPostSession).not.toHaveBeenCalled();
  });

  it("companion: a successful session still runs post-session, publishes 'complete', and sets 'completed'", async () => {
    h.fakeResult.current = completedResult();

    await processAgentJob(makeJob({ ...BASE }));

    expect(h.processPostSession).toHaveBeenCalledTimes(1);
    expect(publishedTypes()).toContain("complete");
    const writes = statusKeyWrites();
    expect(writes).toContain("completed");
    expect(writes).not.toContain("failed");
    expect(h.db.agentSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "completed" }),
      })
    );
  });
});
