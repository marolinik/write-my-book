import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P7-S22 — after a server restart, a follow-up message revived a FAILED
 * session.
 *
 * When the in-memory session is gone, the message route rebuilds it from the
 * AgentSession row, and it hard-set the rebuilt status to "completed" without
 * reading the row. A failed or user-cancelled session therefore became
 * continuable only because the process had restarted — the same row held in
 * memory is refused with 400 "Session is not active" — and its new turns ran
 * outside every fence, uncancellable (the cancel route sees "failed" and
 * answers alreadyDone). The rebuilt session must carry the row's own state.
 */

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
  getSession: vi.fn(),
  createSession: vi.fn(),
  loadConversationHistory: vi.fn(),
  addUserMessage: vi.fn(),
  continueConversation: vi.fn(),
  getWorkflow: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: () => "sk-test" }));
vi.mock("@/lib/cost", () => ({ estimateCost: () => 0 }));
vi.mock("@/lib/llm", () => ({
  mapAgentTypeToRole: () => "coach",
  resolveModelForRole: () => ({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic" },
  }),
  resolveRouteWithLocalFallback: (model: unknown) => ({ route: { route: "direct" }, model }),
  createLLMClient: () => ({
    client: {},
    model: { modelId: "claude-sonnet", id: "anthropic/sonnet", provider: "anthropic" },
  }),
}));
vi.mock("@/lib/agents", () => ({
  getSession: (...a: unknown[]) => h.getSession(...a),
  createSession: (...a: unknown[]) => h.createSession(...a),
  loadConversationHistory: (...a: unknown[]) => h.loadConversationHistory(...a),
  addUserMessage: (...a: unknown[]) => h.addUserMessage(...a),
  addAssistantMessage: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  getWorkflow: (...a: unknown[]) => h.getWorkflow(...a),
  AgentOrchestrator: class {
    continueConversation = (...a: unknown[]) => h.continueConversation(...a);
  },
}));
vi.mock("@/lib/agents/artifact-contract", () => ({
  evaluateArtifactContract: vi.fn(async () => null),
}));
vi.mock("@/lib/documents", () => ({ DocumentService: class {} }));

import { POST } from "@/app/api/books/[id]/agent/[sessionId]/message/route";

const ctx = { params: Promise.resolve({ id: "b1", sessionId: "s1" }) };
const req = () =>
  new Request("http://t/api/books/b1/agent/s1/message", {
    method: "POST",
    body: JSON.stringify({ message: "keep going" }),
  });

function dbRow(status: string) {
  return {
    id: "s1",
    bookId: "b1",
    userId: "u1",
    agentType: "writing-coach",
    workflowId: "coach",
    chapterNumber: null,
    status,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  // The in-memory session is gone: the server restarted.
  h.getSession.mockReturnValue(undefined);
  h.createSession.mockImplementation(
    (sessionId: string, bookId: string, userId: string, agentType: string, workflowId: string) => ({
      sessionId,
      bookId,
      userId,
      agentType,
      workflowId,
      status: "running",
      conversationHistory: [],
      orchestrator: null as unknown,
    })
  );
  h.loadConversationHistory.mockResolvedValue([]);
  h.getWorkflow.mockReturnValue({ conversational: true, primaryAgent: "writing-coach" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", name: "Book", language: "en", settings: null });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic", encryptedKey: "enc" }]);
  h.continueConversation.mockResolvedValue(undefined);
});

describe("P7-S22: a rebuilt session keeps the state its row records", () => {
  it("refuses a follow-up to a FAILED session (400), exactly as it would in memory", async () => {
    h.db.agentSession.findFirst.mockResolvedValue(dbRow("failed"));
    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Session is not active" });
    expect(h.addUserMessage).not.toHaveBeenCalled();
    expect(h.continueConversation).not.toHaveBeenCalled();
  });

  it("refuses the other terminal states too (paused, skipped)", async () => {
    for (const status of ["paused", "skipped"]) {
      h.db.agentSession.findFirst.mockResolvedValue(dbRow(status));
      const res = await POST(req() as never, ctx as never);
      expect(res.status, status).toBe(400);
    }
    expect(h.continueConversation).not.toHaveBeenCalled();
  });

  it("still continues a COMPLETED conversation after a restart", async () => {
    h.db.agentSession.findFirst.mockResolvedValue(dbRow("completed"));
    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.continueConversation).toHaveBeenCalledTimes(1);
  });

  it("lets the writer resume a conversation the restart cut off (row still 'running')", async () => {
    h.db.agentSession.findFirst.mockResolvedValue(dbRow("running"));
    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.continueConversation).toHaveBeenCalledTimes(1);
  });
});
