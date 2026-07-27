import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "@/lib/agents";

/**
 * D-188 (continuation half) — `create-story-bible` is conversational, and the
 * bible is normally written on a LATER turn, which goes through
 * POST /agent/:sessionId/message. That route never calls processPostSession, so
 * the artifact contract is evaluated inline there. Locked:
 *   - streamed-but-unsaved document → recovered, disclosed, turn stays success
 *   - claim with nothing to recover → turn reported FAILED, message says so
 *   - workflow with no declared artifact → nothing evaluated at all
 * The contract must be resolved BEFORE completeSession so the client is never
 * told "success" and contradicted afterwards.
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
  addAssistantMessage: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  getWorkflow: vi.fn(),
  continueConversation: vi.fn(),
  decryptApiKey: vi.fn(),
  estimateCost: vi.fn(),
  mapAgentTypeToRole: vi.fn(),
  resolveModelForRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
  createLLMClient: vi.fn(),
  findByType: vi.fn(),
  create: vi.fn(),
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
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    findByType = h.findByType;
    create = h.create;
  },
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
  AgentOrchestrator: class {
    continueConversation = h.continueConversation;
    cancel = vi.fn();
  },
}));

import { POST } from "@/app/api/books/[id]/agent/[sessionId]/message/route";

const ctx = { params: Promise.resolve({ id: "b1", sessionId: "s1" }) };
function req() {
  return new Request("http://t/api/books/b1/agent/s1/message", {
    method: "POST",
    body: JSON.stringify({ message: "here are my characters" }),
  });
}

const BIBLE = [
  "# Story Bible",
  "",
  "## Characters",
  "| Name | Role |",
  "| --- | --- |",
  "| Marek | protagonist |",
  "",
  "## World",
  Array(230).fill("The harbour freezes and the ledgers do not balance.").join(" "),
  "",
  "**Story Bible Status:** Complete and ready for reference.",
].join("\n");

function session() {
  return {
    sessionId: "s1",
    bookId: "b1",
    userId: "u1",
    agentType: "writing-coach",
    workflowId: "create-story-bible",
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

/** Drive the mocked orchestrator's onComplete with a given assistant reply. */
function replyWith(text: string, documentIds: string[] = []) {
  h.continueConversation.mockImplementation(
    async (opts: { onComplete: (r: AgentResult) => Promise<void> }) => {
      await opts.onComplete({
        success: true,
        tokensInput: 148_752,
        tokensOutput: 11_600,
        documentIds,
        sessionId: "s1",
        assistantText: text,
      });
    }
  );
}

function pushed(): string[] {
  return h.pushMessage.mock.calls.map(
    (c) => (c as [string, { content: string }])[1].content
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.getSession.mockReturnValue(session());
  h.db.agentSession.findFirst.mockResolvedValue({
    id: "s1",
    bookId: "b1",
    userId: "u1",
    agentType: "writing-coach",
    workflowId: "create-story-bible",
    chapterNumber: null,
  });
  h.db.agentSession.update.mockResolvedValue({});
  h.db.book.findFirst.mockResolvedValue({
    id: "b1",
    name: "Dead Reckoning",
    language: "en",
    settings: {},
  });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([
    { provider: "anthropic", encryptedKey: "enc" },
  ]);
  h.db.usageRecord.create.mockResolvedValue({});
  h.decryptApiKey.mockReturnValue("sk-test");
  h.estimateCost.mockReturnValue(0.07);
  h.mapAgentTypeToRole.mockReturnValue("coach");
  h.resolveModelForRole.mockReturnValue({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic", modelId: "claude-sonnet", tier: "flagship" },
  });
  h.resolveProviderRoute.mockReturnValue({ route: "direct", apiKey: "sk-test" });
  h.createLLMClient.mockReturnValue({
    client: {},
    model: { id: "anthropic/sonnet", modelId: "claude-sonnet", tier: "flagship" },
  });
  h.getWorkflow.mockReturnValue({
    id: "create-story-bible",
    conversational: true,
    category: "setup",
    primaryAgent: "writing-coach",
    producesDocument: "STORY_BIBLE",
  });
  h.create.mockResolvedValue({ id: "doc-recovered" });
  h.findByType.mockResolvedValue(null);
  replyWith("…");
});

describe("D-188: continuation turns honour the artifact contract", () => {
  it("recovers a streamed-but-unsaved story bible and discloses it", async () => {
    replyWith(BIBLE);

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0][0]).toBe("STORY_BIBLE");
    await vi.waitFor(() =>
      expect(pushed().join(" ")).toMatch(/Saved your Story Bible/i)
    );

    // The turn genuinely produced the artifact, so it stays a success.
    const [, reported] = h.completeSession.mock.calls.at(-1) as [string, AgentResult];
    expect(reported.success).toBe(true);
  });

  it("reports FAILED when the turn claims a bible it never produced", async () => {
    replyWith("Your story bible is complete and saved.");

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    const [, reported] = h.completeSession.mock.calls.at(-1) as [string, AgentResult];
    expect(reported.success).toBe(false);
    expect(pushed().join(" ")).toMatch(/NOT saved/i);
    expect(h.create).not.toHaveBeenCalled();
    // Spend still recorded — the artifact lie must not become a money lie.
    await vi.waitFor(() => expect(h.db.usageRecord.create).toHaveBeenCalledTimes(1));
  });

  it("leaves an ordinary in-progress turn alone", async () => {
    replyWith("Who is your protagonist, and what do they want?");

    await POST(req() as never, ctx as never);

    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    const [, reported] = h.completeSession.mock.calls.at(-1) as [string, AgentResult];
    expect(reported.success).toBe(true);
    expect(h.create).not.toHaveBeenCalled();
    expect(pushed().join(" ")).not.toMatch(/NOT saved/i);
  });

  it("does not evaluate anything for a workflow with no declared artifact", async () => {
    h.getWorkflow.mockReturnValue({
      id: "discuss-chapter",
      conversational: true,
      category: "writing",
      primaryAgent: "writing-coach",
    });
    replyWith(BIBLE);

    await POST(req() as never, ctx as never);

    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    expect(h.findByType).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
});
