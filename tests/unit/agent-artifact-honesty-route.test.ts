import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "@/lib/agents";

/**
 * D-188 (route half) — POST /api/books/:id/agent must not report success for a
 * declared-artifact workflow that persisted nothing.
 *
 * Captured: `create-story-bible` streamed a full bible, terminated
 * `success: true` / `documentIds: []`, told the writer "**Story Bible Status:**
 * Complete", and left no STORY_BIBLE row — so the `build-architecture` step it
 * then recommended 422'd, and `dev-edit` 422'd "Setup incomplete". Both runs
 * billed.
 *
 * Locked here:
 *   - artifact missing + claim of completion → session reported FAILED, with a
 *     writer-facing message that says nothing was saved
 *   - spend is still recorded (a lie about the artifact must not become a
 *     second lie about the money)
 *   - artifact recovered from the transcript → success, plus a status message
 *     disclosing that the product saved it
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    document: { findMany: vi.fn() },
    chapter: { count: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    agentSession: { create: vi.fn(), update: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  decryptApiKey: vi.fn(),
  estimateWorkflowCost: vi.fn(),
  validatePrices: vi.fn(),
  checkQuota: vi.fn(),
  resolveModelForRole: vi.fn(),
  resolveConductorModelForWorkflow: vi.fn(),
  meetsMinimumTier: vi.fn(),
  mapAgentTypeToRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
  validateApiKey: vi.fn(),
  getWorkflow: vi.fn(),
  getAgentDefinition: vi.fn(),
  createSession: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  validatePrerequisites: vi.fn(),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  processPostSession: vi.fn(),
  enqueueAgentJob: vi.fn(),
  runAgent: vi.fn(),
  agentResult: {} as AgentResult,
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({
  decryptApiKey: (...a: unknown[]) => h.decryptApiKey(...a),
}));
vi.mock("@/lib/llm/cost-estimator", () => ({
  estimateWorkflowCost: (...a: unknown[]) => h.estimateWorkflowCost(...a),
}));
vi.mock("@/lib/llm/price-validator", () => ({
  validatePrices: () => h.validatePrices(),
}));
vi.mock("@/lib/billing/quota-checker", () => ({
  checkQuota: (...a: unknown[]) => h.checkQuota(...a),
}));
vi.mock("@/lib/billing/free-tier-meters", () => ({
  checkConcurrencyFence: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/llm", () => ({
  resolveModelForRole: (...a: unknown[]) => h.resolveModelForRole(...a),
  resolveConductorModelForWorkflow: (...a: unknown[]) =>
    h.resolveConductorModelForWorkflow(...a),
  meetsMinimumTier: (...a: unknown[]) => h.meetsMinimumTier(...a),
  mapAgentTypeToRole: (...a: unknown[]) => h.mapAgentTypeToRole(...a),
  resolveProviderRoute: (...a: unknown[]) => h.resolveProviderRoute(...a),
  validateApiKey: (...a: unknown[]) => h.validateApiKey(...a),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(_opts?: unknown) {}
  },
}));
vi.mock("@/lib/agents", () => ({
  AgentOrchestrator: class {
    runAgent(opts: { onComplete: (r: AgentResult) => Promise<void> }) {
      return h.runAgent(opts);
    }
  },
  getWorkflow: (...a: unknown[]) => h.getWorkflow(...a),
  getAgentDefinition: (...a: unknown[]) => h.getAgentDefinition(...a),
  createSession: (...a: unknown[]) => h.createSession(...a),
  pushMessage: (...a: unknown[]) => h.pushMessage(...a),
  completeSession: (...a: unknown[]) => h.completeSession(...a),
  validatePrerequisites: (...a: unknown[]) => h.validatePrerequisites(...a),
  addUserMessage: (...a: unknown[]) => h.addUserMessage(...a),
  addAssistantMessage: (...a: unknown[]) => h.addAssistantMessage(...a),
  processPostSession: (...a: unknown[]) => h.processPostSession(...a),
}));
vi.mock("@/lib/queue", () => ({
  enqueueAgentJob: (...a: unknown[]) => h.enqueueAgentJob(...a),
}));

import { POST } from "@/app/api/books/[id]/agent/route";

function req() {
  return new Request("http://t/api/books/b1/agent", {
    method: "POST",
    body: JSON.stringify({ workflowId: "create-story-bible" }),
  });
}
const ctx = { params: Promise.resolve({ id: "b1" }) };

const goodResult: AgentResult = {
  success: true,
  tokensInput: 148_752,
  tokensOutput: 11_600,
  documentIds: [],
  sessionId: "s1",
  endReason: "natural",
  assistantText: "**Story Bible Status:** Complete and ready for reference.",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({
    id: "b1",
    name: "Dead Reckoning",
    language: "en",
    settings: { setupComplete: true },
  });
  h.db.document.findMany.mockResolvedValue([]);
  h.db.chapter.count.mockResolvedValue(8);
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([
    { provider: "anthropic", encryptedKey: "enc", validatedAt: new Date() },
  ]);
  h.db.agentSession.create.mockResolvedValue({ id: "s1" });
  h.db.agentSession.update.mockResolvedValue({});
  h.db.usageRecord.create.mockResolvedValue({});
  h.decryptApiKey.mockReturnValue("sk-test");
  h.estimateWorkflowCost.mockReturnValue({ max: 1, min: 0.5 });
  h.validatePrices.mockResolvedValue(undefined);
  h.checkQuota.mockResolvedValue({ allowed: true, currentPlan: "professional" });
  h.resolveModelForRole.mockReturnValue({
    registryId: "anthropic/sonnet",
    modelDef: {
      provider: "anthropic",
      modelId: "claude-sonnet",
      tier: "flagship",
      displayName: "Sonnet",
    },
  });
  h.resolveConductorModelForWorkflow.mockReturnValue({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic", modelId: "claude-sonnet", tier: "flagship" },
  });
  h.meetsMinimumTier.mockReturnValue(true);
  h.mapAgentTypeToRole.mockReturnValue("coach");
  h.resolveProviderRoute.mockReturnValue({
    route: "direct",
    apiKey: "sk-litellm",
    baseURL: undefined,
    effectiveModelId: "claude-sonnet",
  });
  h.validateApiKey.mockResolvedValue({ valid: true });
  h.getAgentDefinition.mockReturnValue({ type: "writing-coach", tools: [] });
  h.validatePrerequisites.mockResolvedValue({ satisfied: true, missing: [] });
  h.createSession.mockImplementation(() => ({}));
  h.getWorkflow.mockReturnValue({
    conversational: true,
    category: "setup",
    primaryAgent: "writing-coach",
    estimatedMaxMinutes: 8,
    producesDocument: "STORY_BIBLE",
  });
  h.agentResult = { ...goodResult };
  h.runAgent.mockImplementation(
    async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
      await opts.onComplete(h.agentResult);
    }
  );
});

/** The AgentResult the route handed to completeSession. */
function completedResult(): AgentResult & { resultMeta?: Record<string, unknown> } {
  const call = h.completeSession.mock.calls.at(-1) as [string, AgentResult];
  return call[1];
}
function pushedContents(): string[] {
  return h.pushMessage.mock.calls.map(
    (c) => (c as [string, { content: string }])[1].content
  );
}

describe("D-188: declared-artifact workflow cannot report empty success", () => {
  it("missing artifact + completion claim → session FAILED with an honest message", async () => {
    h.processPostSession.mockResolvedValue({
      suggestedNext: ["create-story-bible"],
      findingsCreated: 0,
      statusAdvanced: false,
      artifact: {
        workflowId: "create-story-bible",
        expectedType: "STORY_BIBLE",
        artifactExists: false,
        recovered: false,
        claimedComplete: true,
        honest: false,
        message:
          "The Story Bible was NOT saved — no STORY_BIBLE document exists for this book.",
      },
    });

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    expect(completedResult().success).toBe(false);
    expect(pushedContents().join(" ")).toMatch(/NOT saved/i);

    // Session row must not read "completed" when the deliverable is absent…
    await vi.waitFor(() => {
      const statuses = h.db.agentSession.update.mock.calls.map(
        (c) => (c as [{ data: { status?: string } }])[0].data.status
      );
      expect(statuses).toContain("failed");
    });
    // …but the spend really happened, so it is still recorded.
    expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1);
  });

  it("recovered artifact → success, with disclosure that the product saved it", async () => {
    h.processPostSession.mockResolvedValue({
      suggestedNext: ["build-architecture"],
      findingsCreated: 0,
      statusAdvanced: false,
      artifact: {
        workflowId: "create-story-bible",
        expectedType: "STORY_BIBLE",
        artifactExists: true,
        recovered: true,
        claimedComplete: true,
        honest: true,
        documentId: "doc-recovered",
        message: "Saved your Story Bible as a document (the agent left it unsaved).",
      },
    });

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    expect(completedResult().success).toBe(true);
    expect(pushedContents().join(" ")).toMatch(/Saved your Story Bible/i);
  });

  it("REGRESSION: workflows with no artifact contract are untouched", async () => {
    h.processPostSession.mockResolvedValue({
      suggestedNext: ["plan-chapter"],
      findingsCreated: 0,
      statusAdvanced: false,
    });

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    expect(completedResult().success).toBe(true);
    await vi.waitFor(() =>
      expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1)
    );
  });
});
