// P2-29: a conversational turn after the first runs on the model and budget
// the session started with, not a fresh $10 default and a re-resolved model
// chain, and its usage row carries the same label as turn 1's.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "@/lib/agents";

const h = vi.hoisted(() => ({
  db: {
    agentSession: { findFirst: vi.fn(), update: vi.fn() },
    book: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  ctor: vi.fn(),
  createLLMClient: vi.fn(),
  resolveModelForRole: vi.fn(),
  getModelDef: vi.fn(),
  resolveSessionKeys: vi.fn(),
  continueConversation: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/cost", () => ({ estimateCost: () => 0.01 }));
vi.mock("@/lib/billing/session-keys", () => ({ resolveSessionKeys: h.resolveSessionKeys }));
vi.mock("@/lib/llm", () => ({
  mapAgentTypeToRole: () => "editor",
  resolveModelForRole: h.resolveModelForRole,
  getModelDef: h.getModelDef,
  resolveRouteWithLocalFallback: (model: unknown) => ({ route: { route: "direct", apiKey: "k" }, model }),
  createLLMClient: h.createLLMClient,
}));
vi.mock("@/lib/agents", () => ({
  beginTurn: () => true,
  endTurn: () => {},
  getSession: () => undefined,
  createSession: () => ({
    sessionId: "s1",
    bookId: "b1",
    userId: "u1",
    workflowId: "line-edit-chat",
    status: "completed",
    subOrchestrators: new Map(),
    conversationHistory: [],
    listeners: new Set(),
    completionListeners: new Set(),
  }),
  loadConversationHistory: async () => [],
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  getWorkflow: () => ({ conversational: true, primaryAgent: "line-editor" }),
  AgentOrchestrator: class {
    constructor(opts: unknown) {
      h.ctor(opts);
    }
    continueConversation = h.continueConversation;
    cancel = vi.fn();
  },
}));

import { POST } from "@/app/api/books/[id]/agent/[sessionId]/message/route";

const CONDUCTOR = { id: "openrouter-qwen36/sonnet", modelId: "qwen/qwen3.6", provider: "openrouter" };
const SPECIALIST = { id: "anthropic/opus", modelId: "claude-opus", provider: "anthropic" };

const call = () =>
  POST(
    new Request("http://t/api/books/b1/agent/s1/message", {
      method: "POST",
      body: JSON.stringify({ message: "and the ending?" }),
    }) as never,
    { params: Promise.resolve({ id: "b1", sessionId: "s1" }) }
  );

const row = (extra: Record<string, unknown>) => ({
  id: "s1",
  bookId: "b1",
  userId: "u1",
  agentType: "writing-coach",
  workflowId: "line-edit-chat",
  chapterNumber: 3,
  status: "completed",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findFirst.mockResolvedValue({ id: "b1", name: "B", language: "en", settings: null });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: null });
  h.db.usageRecord.create.mockResolvedValue({});
  h.db.agentSession.update.mockResolvedValue({});
  h.resolveModelForRole.mockReturnValue({ registryId: SPECIALIST.id, modelDef: SPECIALIST });
  h.getModelDef.mockImplementation((id: string) => (id === CONDUCTOR.id ? CONDUCTOR : undefined));
  h.createLLMClient.mockImplementation((o: { modelId: string }) => ({
    client: {},
    model: o.modelId === CONDUCTOR.id ? CONDUCTOR : SPECIALIST,
  }));
  h.resolveSessionKeys.mockResolvedValue({ availableKeys: { openrouterApiKey: "k" }, keySource: "user", managed: null });
  h.continueConversation.mockImplementation(async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
    await opts.onComplete({ success: true, tokensInput: 5, tokensOutput: 5, documentIds: [], sessionId: "s1", assistantText: "reply" });
  });
});

describe("POST /message continues on the session's own model and budget", () => {
  it("uses the registry id and budget stored at session start", async () => {
    h.db.agentSession.findFirst.mockResolvedValue(row({ registryId: CONDUCTOR.id, budgetUsd: 1.5 }));
    await call();
    await vi.waitFor(() => expect(h.ctor).toHaveBeenCalled());
    expect(h.createLLMClient.mock.calls[0][0].modelId).toBe(CONDUCTOR.id);
    expect(h.ctor.mock.calls[0][0]).toMatchObject({ registryId: CONDUCTOR.id, maxSessionCostUsd: 1.5 });
  });

  it("on the managed tier the stored budget is clamped to what is left of the allowance", async () => {
    h.db.agentSession.findFirst.mockResolvedValue(row({ registryId: CONDUCTOR.id, budgetUsd: 1.5 }));
    h.resolveSessionKeys.mockResolvedValue({
      availableKeys: { openrouterApiKey: "platform" },
      keySource: "platform",
      managed: { config: { provider: "openrouter", apiKey: "platform" }, allowance: { remainingTodayUsd: 0.2, remainingThisMonthUsd: 3 } },
    });
    await call();
    await vi.waitFor(() => expect(h.ctor).toHaveBeenCalled());
    expect(h.ctor.mock.calls[0][0].maxSessionCostUsd).toBeLessThanOrEqual(0.2);
  });

  it("records usage under the workflow label turn 1 used", async () => {
    h.db.agentSession.findFirst.mockResolvedValue(row({ registryId: CONDUCTOR.id, budgetUsd: 1.5 }));
    await call();
    await vi.waitFor(() => expect(h.db.usageRecord.create).toHaveBeenCalled());
    expect(h.db.usageRecord.create.mock.calls[0][0].data.agentType).toBe("line-edit-chat");
  });

  it("a session from before the columns existed still runs (re-resolved model, default budget)", async () => {
    h.db.agentSession.findFirst.mockResolvedValue(row({ registryId: null, budgetUsd: null }));
    const res = await call();
    expect(res.status).toBeLessThan(400);
    await vi.waitFor(() => expect(h.ctor).toHaveBeenCalled());
  });
});
