import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "@/lib/agents";

/**
 * D-04/D-38 first-turn carve-out (POST /api/books/:id/agent, inline SSE path).
 *
 * The onComplete billing branch has a carve-out that skips usageRecord.create
 * for an empty / whitespace-only assistant reply — but ONLY for a
 * `workflow.conversational` run whose deliverable IS that text. A
 * non-conversational run (a findings/document workflow) legitimately produces
 * little or no coach text and MUST still bill. These two cases pin that
 * polarity so a refactor that drops the `workflow.conversational` gate — or
 * makes the carve-out unconditional — is caught:
 *   (a) conversational + success + empty text  → NOT billed
 *   (b) non-conversational + success + empty text → IS billed (polarity guard)
 *
 * This inline route previously had ZERO direct test coverage.
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
  // @/lib/llm seam
  resolveModelForRole: vi.fn(),
  resolveConductorModel: vi.fn(),
  meetsMinimumTier: vi.fn(),
  mapAgentTypeToRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
  validateApiKey: vi.fn(),
  // @/lib/agents seam
  getWorkflow: vi.fn(),
  getAgentDefinition: vi.fn(),
  createSession: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  validatePrerequisites: vi.fn(),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  processPostSession: vi.fn(),
  runAgent: vi.fn(),
  enqueueAgentJob: vi.fn(),
  // per-test knobs
  workflow: {} as Record<string, unknown>,
  agentResult: {} as AgentResult,
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: (...a: unknown[]) => h.decryptApiKey(...a) }));
vi.mock("@/lib/llm/cost-estimator", () => ({
  estimateWorkflowCost: (...a: unknown[]) => h.estimateWorkflowCost(...a),
}));
vi.mock("@/lib/llm/price-validator", () => ({
  validatePrices: () => h.validatePrices(),
}));
vi.mock("@/lib/billing/quota-checker", () => ({
  checkQuota: (...a: unknown[]) => h.checkQuota(...a),
}));
vi.mock("@/lib/llm", () => ({
  resolveModelForRole: (...a: unknown[]) => h.resolveModelForRole(...a),
  resolveConductorModel: (...a: unknown[]) => h.resolveConductorModel(...a),
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
vi.mock("@/lib/queue", () => ({ enqueueAgentJob: (...a: unknown[]) => h.enqueueAgentJob(...a) }));

import { POST } from "@/app/api/books/[id]/agent/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
const req = () =>
  new Request("http://t/api/books/b1/agent", {
    method: "POST",
    body: JSON.stringify({
      workflowId: "new-novel",
      pageContext: { currentRoute: "/books/b1/write" },
    }),
  });

/** Empty coach text: reasoning burned the whole budget, or a hollow turn. */
const emptyResult: AgentResult = {
  success: true,
  tokensInput: 10,
  tokensOutput: 20,
  documentIds: [],
  sessionId: "s1",
  assistantText: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);

  // Default: a NON-setup, wizard-complete book so the setup guard is skipped
  // without needing the document/chapter lookups.
  h.db.book.findFirst.mockResolvedValue({
    id: "b1",
    name: "My Book",
    language: "en",
    settings: { setupComplete: true },
  });
  h.db.document.findMany.mockResolvedValue([]);
  h.db.chapter.count.mockResolvedValue(0);
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
    modelDef: { provider: "anthropic", modelId: "claude-sonnet", tier: "flagship", displayName: "Sonnet" },
  });
  h.resolveConductorModel.mockReturnValue({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic", modelId: "claude-sonnet" },
  });
  h.meetsMinimumTier.mockReturnValue(true);
  h.mapAgentTypeToRole.mockReturnValue("coach");
  // "sk-litellm" apiKey short-circuits the session-start re-validation branch.
  h.resolveProviderRoute.mockReturnValue({
    route: "direct",
    apiKey: "sk-litellm",
    baseURL: undefined,
    headers: undefined,
    effectiveModelId: "claude-sonnet",
  });
  h.validateApiKey.mockResolvedValue({ valid: true });

  h.getAgentDefinition.mockReturnValue({ type: "writing-coach" });
  h.validatePrerequisites.mockResolvedValue({ satisfied: true, missing: [] });
  h.createSession.mockImplementation(() => ({ orchestrator: null as unknown }));
  h.processPostSession.mockResolvedValue({
    suggestedNext: [],
    findingsCreated: 0,
    statusAdvanced: false,
    newStatus: undefined,
    betaGateResult: undefined,
  });

  // Orchestrator drives the completion synchronously through onComplete.
  h.runAgent.mockImplementation(
    async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
      await opts.onComplete(h.agentResult);
    }
  );
});

describe("POST /api/books/:id/agent — first-turn empty-reply billing", () => {
  it("(a) conversational + empty text: NOT billed, honest error surfaced", async () => {
    // Inline (conversational never routes to the background queue).
    h.workflow = {
      conversational: true,
      category: "writing",
      primaryAgent: "writing-coach",
    };
    h.getWorkflow.mockReturnValue(h.workflow);
    h.agentResult = { ...emptyResult };

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    // The carve-out fires: no usage record, and an honest error is pushed.
    await vi.waitFor(() =>
      expect(h.pushMessage).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({
          type: "error",
          content: expect.stringContaining("empty response"),
        })
      )
    );
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
  });

  it("(b) NON-conversational + empty coach text: IS billed (polarity guard)", async () => {
    // estimatedMaxMinutes omitted → (5 > 5) is false → stays on the inline path.
    h.workflow = {
      conversational: false,
      category: "editorial",
      primaryAgent: "line-editor",
    };
    h.getWorkflow.mockReturnValue(h.workflow);
    h.agentResult = { ...emptyResult };

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    // A findings run's deliverable is not chat text, so empty coach text must
    // still record spend — the carve-out must not swallow it.
    await vi.waitFor(() =>
      expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1)
    );
  });
});
