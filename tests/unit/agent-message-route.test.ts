import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "@/lib/agents";

// Result the (mocked) orchestrator reports on completion.
const completionResult: AgentResult = {
  success: true,
  tokensInput: 10,
  tokensOutput: 20,
  documentIds: [],
  sessionId: "s1",
  assistantText: "coach reply",
};

// Prior conversation persisted for this session (what rehydration returns).
const priorHistory = [
  { role: "user" as const, content: "hi" },
  { role: "assistant" as const, content: "hello, what are we writing?" },
];

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    agentSession: { findFirst: vi.fn(), update: vi.fn() },
    book: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  // session-manager seam
  getSession: vi.fn(),
  createSession: vi.fn(),
  loadConversationHistory: vi.fn(),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  getWorkflow: vi.fn(),
  // orchestrator boundary
  continueConversation: vi.fn(),
  // llm seam
  decryptApiKey: vi.fn(),
  estimateCost: vi.fn(),
  mapAgentTypeToRole: vi.fn(),
  resolveModelForRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
  createLLMClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: h.decryptApiKey }));
vi.mock("@/lib/cost", () => ({ estimateCost: h.estimateCost }));
vi.mock("@/lib/llm", () => ({
  mapAgentTypeToRole: h.mapAgentTypeToRole,
  resolveModelForRole: h.resolveModelForRole,
  resolveProviderRoute: h.resolveProviderRoute,
  createLLMClient: h.createLLMClient,
}));
vi.mock("@/lib/agents", () => ({
  getSession: h.getSession,
  createSession: h.createSession,
  loadConversationHistory: h.loadConversationHistory,
  addUserMessage: h.addUserMessage,
  addAssistantMessage: h.addAssistantMessage,
  pushMessage: h.pushMessage,
  completeSession: h.completeSession,
  getWorkflow: h.getWorkflow,
  // The orchestrator boundary — continueConversation drives onComplete.
  AgentOrchestrator: class {
    continueConversation = h.continueConversation;
    cancel = vi.fn();
  },
}));

import { POST } from "@/app/api/books/[id]/agent/[sessionId]/message/route";

const ctx = { params: Promise.resolve({ id: "b1", sessionId: "s1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/agent/s1/message", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function freshSession() {
  return {
    sessionId: "s1",
    bookId: "b1",
    userId: "u1",
    agentType: "writing-coach",
    workflowId: "new-novel",
    orchestrator: null as unknown,
    subOrchestrators: new Map(),
    status: "completed",
    messages: [],
    conversationHistory: [] as unknown[],
    listeners: new Set(),
    completionListeners: new Set(),
    result: null,
    suggestedNext: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);

  // In-memory session is gone (server restarted) → reconstruction path, which
  // is exactly where rehydration from ConversationTurn rows must happen.
  h.getSession.mockReturnValue(undefined);
  h.db.agentSession.findFirst.mockResolvedValue({
    id: "s1",
    bookId: "b1",
    userId: "u1",
    agentType: "writing-coach",
    workflowId: "new-novel",
    chapterNumber: null,
  });
  h.createSession.mockImplementation(() => freshSession());
  h.loadConversationHistory.mockResolvedValue(priorHistory);
  h.getWorkflow.mockReturnValue({ conversational: true, primaryAgent: "writing-coach" });

  h.db.book.findFirst.mockResolvedValue({ id: "b1", name: "My Book", language: "en", settings: null });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic", encryptedKey: "enc" }]);
  h.db.agentSession.update.mockResolvedValue({});
  h.db.usageRecord.create.mockResolvedValue({});

  h.decryptApiKey.mockReturnValue("sk-test");
  h.estimateCost.mockReturnValue(0);
  h.mapAgentTypeToRole.mockReturnValue("coach");
  h.resolveModelForRole.mockReturnValue({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic" },
  });
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.createLLMClient.mockReturnValue({
    client: {},
    model: { modelId: "claude-sonnet", id: "anthropic/sonnet", tier: "balanced" },
  });

  // Default: orchestrator runs and reports completion (invokes onComplete).
  h.continueConversation.mockImplementation(async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
    await opts.onComplete(completionResult);
  });
});

describe("POST /api/books/:id/agent/:sessionId/message", () => {
  it("401s when auth fails", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    const res = await POST(req({ message: "x" }) as never, ctx as never);
    expect(res.status).toBe(401);
  });

  it("400s on invalid input (empty message)", async () => {
    const res = await POST(req({ message: "" }) as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it("404s when the session is not found for this user/book", async () => {
    h.db.agentSession.findFirst.mockResolvedValueOnce(null);
    const res = await POST(req({ message: "x" }) as never, ctx as never);
    expect(res.status).toBe(404);
  });

  it("rehydrates prior turns and seeds them into the orchestrator invocation", async () => {
    const res = await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    expect(res.status).toBe(200);

    // Prior turns were loaded for this session…
    expect(h.loadConversationHistory).toHaveBeenCalledWith("s1");
    // …and passed as the seed history to the orchestrator (2nd positional arg),
    // with the new user message as the 3rd — this is the amnesia fix.
    expect(h.continueConversation).toHaveBeenCalledTimes(1);
    const [, seededHistory, userMessage] = h.continueConversation.mock.calls[0];
    expect(seededHistory).toEqual(priorHistory);
    expect(userMessage).toBe("chapter one idea");
  });

  it("persists the incoming user turn (after rehydration, before the orchestrator appends it)", async () => {
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    expect(h.addUserMessage).toHaveBeenCalledWith("s1", "chapter one idea");

    // Ordering guard: the new user turn is persisted only AFTER the prior
    // history is loaded, so it is never double-counted into the seed.
    const loadOrder = h.loadConversationHistory.mock.invocationCallOrder[0];
    const persistOrder = h.addUserMessage.mock.invocationCallOrder[0];
    expect(persistOrder).toBeGreaterThan(loadOrder);
  });

  it("persists the assistant reply on completion", async () => {
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    await vi.waitFor(() =>
      expect(h.addAssistantMessage).toHaveBeenCalledWith("s1", "coach reply")
    );
  });

  it("does NOT persist an assistant turn for a cancelled session", async () => {
    h.continueConversation.mockImplementationOnce(
      async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
        await opts.onComplete({ ...completionResult, cancelled: true });
      }
    );
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    // Give the fire-and-forget completion a tick to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(h.addAssistantMessage).not.toHaveBeenCalled();
  });

  // ── D-04/D-38: an empty assistant reply is not a billable result ──────────
  it("does NOT bill and surfaces an honest error for a whitespace-only reply", async () => {
    h.continueConversation.mockImplementationOnce(
      async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
        // Reasoning model burned the whole budget → success:true but no text.
        await opts.onComplete({ ...completionResult, assistantText: "   \n", success: true });
      }
    );
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    await vi.waitFor(() =>
      expect(h.pushMessage).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ type: "error" })
      )
    );
    // The writer is never charged for silence, and no fake assistant turn is kept.
    expect(h.db.usageRecord.create).not.toHaveBeenCalled();
    expect(h.addAssistantMessage).not.toHaveBeenCalled();
  });

  it("keeps the session continuable after an empty reply (no stuck state)", async () => {
    h.continueConversation.mockImplementationOnce(
      async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
        await opts.onComplete({ ...completionResult, assistantText: "", success: true });
      }
    );
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    // completeSession is driven with success:true, so the in-memory session
    // stays "completed" (continuable) — an empty reply must not brick the chat.
    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    const lastArgs = h.completeSession.mock.calls.at(-1) as [string, AgentResult];
    expect(lastArgs[1].success).toBe(true);
  });

  it("bills and persists a genuine non-empty reply (regression guard)", async () => {
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    await vi.waitFor(() => expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1));
    expect(h.addAssistantMessage).toHaveBeenCalledWith("s1", "coach reply");
  });

  // ── D-36 interplay: the empty-reply carve-out is success-AND-not-cancelled
  // gated, so real partial spend on a failure or an abort is still billed. A
  // future refactor that collapses the predicate to a bare emptiness check
  // would pass every test above yet stop billing here — these lock that. ─────
  it("bills partial spend for a provider-failure run that produced no text (D-36 honesty)", async () => {
    h.continueConversation.mockImplementationOnce(
      async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
        // Provider failed mid-turn: success:false, tokens already spent, no text.
        await opts.onComplete({ ...completionResult, assistantText: "", success: false });
      }
    );
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    // The success-only carve-out must NOT swallow this — spend is real.
    await vi.waitFor(() => expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1));
    // No fake assistant turn is kept for the empty text.
    expect(h.addAssistantMessage).not.toHaveBeenCalled();
  });

  it("bills partial spend when the user cancels a turn before any text (partial abort)", async () => {
    h.continueConversation.mockImplementationOnce(
      async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
        // User aborted: cancelled:true, budget already consumed, no text yet.
        await opts.onComplete({ ...completionResult, assistantText: "", cancelled: true });
      }
    );
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    // The carve-out is `!cancelled`-gated, so an abort is still billed honestly.
    await vi.waitFor(() => expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1));
    expect(h.addAssistantMessage).not.toHaveBeenCalled();
  });

  // ── D-58: a continuation that wrote documents then failed must report the
  // real partial documentIds on completion, not an empty list. The orchestrator
  // passes them as the 2nd onError arg (orchestrator.ts:362); the route must
  // thread them through completeSession instead of hardcoding []. ───────────
  it("reports the real partial documentIds on error, not an empty list (D-58 honesty)", async () => {
    h.continueConversation.mockImplementationOnce(
      async (opts: {
        onError: (
          e: Error,
          partial?: { documentIds: string[] }
        ) => Promise<void>;
      }) => {
        // The turn wrote two docs, then the provider failed mid-stream.
        await opts.onError(new Error("boom"), {
          documentIds: ["doc-a", "doc-b"],
        });
      }
    );
    await POST(req({ message: "chapter one idea" }) as never, ctx as never);
    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    const lastArgs = h.completeSession.mock.calls.at(-1) as [string, AgentResult];
    expect(lastArgs[1].success).toBe(false);
    expect(lastArgs[1].documentIds).toEqual(["doc-a", "doc-b"]);
  });
});
