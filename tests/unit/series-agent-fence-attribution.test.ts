import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * POST /api/series/:id/agent — three gaps against its book-agent sibling.
 *
 *  - P7-S15: the Free one-running-session fence was never consulted, so a Free
 *    writer with a series held three sessions running at once. The fence must
 *    refuse with 429 + upgradeToTier BEFORE a session row exists.
 *  - P3-S12: the session row was created without workflowId / chapterNumber,
 *    so series runs showed a generic label, never reached a chapter's history,
 *    and a conversational follow-up after a restart answered 404.
 *  - P7-S13: every session start is written to the user-keyed ledger so the
 *    monthly cap survives the book being deleted.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    series: { findFirst: vi.fn() },
    book: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { findMany: vi.fn() },
    agentSession: { create: vi.fn(), update: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  checkQuota: vi.fn(),
  checkConcurrencyFence: vi.fn(),
  recordAgentSessionStart: vi.fn(),
  parse: vi.fn(),
  getWorkflow: vi.fn(),
  resolveProviderRoute: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: () => "sk-test" }));
vi.mock("@/lib/cost", () => ({ estimateCost: () => 0 }));
vi.mock("@/lib/billing/quota-checker", () => ({
  checkQuota: (...a: unknown[]) => h.checkQuota(...a),
}));
vi.mock("@/lib/billing/free-tier-meters", () => ({
  checkConcurrencyFence: (...a: unknown[]) => h.checkConcurrencyFence(...a),
  recordAgentSessionStart: (...a: unknown[]) => h.recordAgentSessionStart(...a),
}));
vi.mock("@/lib/validation", () => ({
  startSeriesAgentSchema: { parse: (b: unknown) => h.parse(b) },
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType() {
      return Promise.resolve(null);
    }
    read() {
      return Promise.resolve(null);
    }
  },
}));
vi.mock("@/generated/prisma/enums", () => ({
  DocumentType: { SERIES_BIBLE: "SERIES_BIBLE", SERIES_ARCHITECTURE: "SERIES_ARCHITECTURE" },
}));
vi.mock("@/lib/llm", () => ({
  createLLMClient: () => ({ client: {}, model: { id: "claude-sonnet", modelId: "claude-sonnet" } }),
  resolveModelForRole: () => ({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic", modelId: "claude-sonnet" },
  }),
  mapAgentTypeToRole: () => "planner",
  resolveRouteWithLocalFallback: (model: unknown) => ({
    route: h.resolveProviderRoute(),
    model,
  }),
}));
vi.mock("@/lib/agents", () => ({
  AgentOrchestrator: class {
    constructor(_opts?: unknown) {}
    runAgent(opts: unknown) {
      return h.runAgent(opts);
    }
  },
  getWorkflow: (...a: unknown[]) => h.getWorkflow(...a),
  getAgentDefinition: () => ({ type: "scene-planner" }),
  createSession: () => ({ orchestrator: null as unknown }),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  processPostSession: vi.fn(),
}));

import { POST } from "@/app/api/series/[id]/agent/route";

const ctx = { params: Promise.resolve({ id: "series1" }) };
const req = () =>
  new Request("http://t/api/series/series1/agent", {
    method: "POST",
    body: JSON.stringify({ workflowId: "plan-chapter", bookId: "b1", chapterNumber: 1 }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.parse.mockReturnValue({ workflowId: "plan-chapter", bookId: "b1", chapterNumber: 1 });
  h.db.series.findFirst.mockResolvedValue({ id: "series1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", name: "Book", language: "en", settings: null });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([{ provider: "anthropic", encryptedKey: "enc" }]);
  h.db.agentSession.create.mockResolvedValue({ id: "s1" });
  h.db.agentSession.update.mockResolvedValue({});
  h.checkQuota.mockResolvedValue({ allowed: true, currentPlan: "none", isFree: true });
  h.checkConcurrencyFence.mockResolvedValue({ allowed: true });
  h.recordAgentSessionStart.mockResolvedValue(undefined);
  h.getWorkflow.mockReturnValue({ primaryAgent: "scene-planner", estimatedMaxMinutes: 5 });
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.runAgent.mockResolvedValue(undefined);
});

describe("P7-S15: series agent honours the Free one-session fence", () => {
  it("429s with the fence copy + upgradeToTier and creates no session", async () => {
    h.checkConcurrencyFence.mockResolvedValue({
      allowed: false,
      reason: "One AI session at a time on the Free plan — your current session is still running.",
      upgradeToTier: "indie",
    });
    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "One AI session at a time on the Free plan — your current session is still running.",
      upgradeToTier: "indie",
    });
    expect(h.checkConcurrencyFence).toHaveBeenCalledWith("u1");
    expect(h.db.agentSession.create).not.toHaveBeenCalled();
    expect(h.recordAgentSessionStart).not.toHaveBeenCalled();
  });

  it("starts the session when the fence allows it", async () => {
    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: "s1" });
  });
});

describe("P3-S12: series sessions record what they ran", () => {
  it("stores workflowId and chapterNumber on the session row", async () => {
    await POST(req() as never, ctx as never);
    const args = h.db.agentSession.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data.workflowId).toBe("plan-chapter");
    expect(args.data.chapterNumber).toBe(1);
  });

  it("stores chapterNumber null for a book-level run", async () => {
    h.parse.mockReturnValue({ workflowId: "series-planning", bookId: "b1" });
    await POST(req() as never, ctx as never);
    const args = h.db.agentSession.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data.workflowId).toBe("series-planning");
    expect(args.data.chapterNumber).toBeNull();
  });
});

describe("P7-S13: series session starts reach the user-keyed ledger", () => {
  it("records the start once the session row exists", async () => {
    await POST(req() as never, ctx as never);
    expect(h.recordAgentSessionStart).toHaveBeenCalledWith("u1");
    const created = h.db.agentSession.create.mock.invocationCallOrder[0];
    const recorded = h.recordAgentSessionStart.mock.invocationCallOrder[0];
    expect(recorded).toBeGreaterThan(created);
  });
});
