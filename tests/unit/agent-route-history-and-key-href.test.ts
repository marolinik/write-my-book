import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/books/:id/agent — three contracts the agent panel and the Free tier
 * rely on.
 *
 *  - P5-S17: the panel's "Session history" pane fetches
 *    GET /api/books/:id/agent?limit=10 and renders past sessions
 *    {id, workflowId, tokensInput, tokensOutput, startedAt, completedAt}. The
 *    route exported only POST, so the fetch was a 405 and the pane always
 *    said there were no past sessions.
 *  - P1-S04: the NO_PROVIDER_KEY refusal hands the client a next step. Its
 *    href was /settings/api-keys, a page that does not exist (404); the app's
 *    own deep link to the API-keys section is /settings#api-keys.
 *  - P7-S13: every session start is written to the user-keyed ledger so the
 *    monthly cap survives the book being deleted.
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
    agentSession: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    usageRecord: { create: vi.fn() },
  },
  checkQuota: vi.fn(),
  managedKeyFor: vi.fn(),
  recordAgentSessionStart: vi.fn(),
  resolveProviderRoute: vi.fn(),
  getWorkflow: vi.fn(),
  runAgent: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: () => "sk-test" }));
vi.mock("@/lib/llm/cost-estimator", () => ({
  estimateWorkflowCost: () => ({ max: 1, min: 0.5 }),
}));
vi.mock("@/lib/llm/cost-calibration", () => ({
  passUsageType: (workflowId: string) => workflowId,
}));
vi.mock("@/lib/llm/price-validator", () => ({ validatePrices: async () => undefined }));
vi.mock("@/lib/billing/quota-checker", () => ({
  checkQuota: (...a: unknown[]) => h.checkQuota(...a),
}));
vi.mock("@/lib/billing/managed-tier", () => ({
  managedKeyFor: (...a: unknown[]) => h.managedKeyFor(...a),
}));
vi.mock("@/lib/billing/free-tier-meters", () => ({
  checkConcurrencyFence: vi.fn(async () => ({ allowed: true })),
  recordAgentSessionStart: (...a: unknown[]) => h.recordAgentSessionStart(...a),
}));
vi.mock("@/lib/llm", () => ({
  resolveModelForRole: () => ({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic", modelId: "claude-sonnet", tier: "flagship", displayName: "Sonnet" },
  }),
  resolveConductorModelForWorkflow: () => ({
    registryId: "anthropic/sonnet",
    modelDef: { id: "anthropic/sonnet", provider: "anthropic", modelId: "claude-sonnet" },
  }),
  meetsMinimumTier: () => true,
  mapAgentTypeToRole: () => "coach",
  resolveRouteWithLocalFallback: (model: unknown) => ({
    route: h.resolveProviderRoute(),
    model,
  }),
  validateApiKey: async () => ({ valid: true }),
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(_opts?: unknown) {}
  },
}));
vi.mock("@/lib/agents", () => ({
  AgentOrchestrator: class {
    runAgent(opts: unknown) {
      return h.runAgent(opts);
    }
  },
  getWorkflow: (...a: unknown[]) => h.getWorkflow(...a),
  getAgentDefinition: () => ({ type: "writing-coach" }),
  createSession: () => ({ orchestrator: null as unknown }),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  validatePrerequisites: async () => ({ satisfied: true, missing: [] }),
  addUserMessage: vi.fn(),
  addAssistantMessage: vi.fn(),
  processPostSession: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({ enqueueAgentJob: vi.fn() }));

import * as route from "@/app/api/books/[id]/agent/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
const postReq = () =>
  new Request("http://t/api/books/b1/agent", {
    method: "POST",
    body: JSON.stringify({ workflowId: "coach" }),
  });
const getReq = (query = "?limit=10") =>
  new Request(`http://t/api/books/b1/agent${query}`, { method: "GET" });

type GetHandler = (req: unknown, ctx: unknown) => Promise<Response>;
const GET = (route as unknown as { GET?: GetHandler }).GET;

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({
    id: "b1",
    name: "My Book",
    language: "en",
    settings: { setupComplete: true },
  });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.db.apiKey.findMany.mockResolvedValue([
    { provider: "anthropic", encryptedKey: "enc", validatedAt: new Date() },
  ]);
  h.db.agentSession.create.mockResolvedValue({ id: "s1" });
  h.db.agentSession.update.mockResolvedValue({});
  h.db.agentSession.findMany.mockResolvedValue([]);
  h.checkQuota.mockResolvedValue({ allowed: true, currentPlan: "none", isFree: true });
  h.managedKeyFor.mockResolvedValue(null);
  h.recordAgentSessionStart.mockResolvedValue(undefined);
  h.getWorkflow.mockReturnValue({
    conversational: true,
    category: "writing",
    primaryAgent: "writing-coach",
  });
  h.resolveProviderRoute.mockReturnValue({
    route: "direct",
    apiKey: "sk-litellm",
    effectiveModelId: "claude-sonnet",
  });
  h.runAgent.mockResolvedValue(undefined);
});

describe("P5-S17: GET /api/books/:id/agent lists the writer's past sessions", () => {
  it("exists (no 405) and returns the book's completed sessions, newest first", async () => {
    expect(typeof GET).toBe("function");
    const rows = [
      {
        id: "s2",
        workflowId: "coach",
        agentType: "writing-coach",
        chapterNumber: null,
        status: "completed",
        tokensInput: 1200,
        tokensOutput: 300,
        startedAt: new Date("2026-09-20T10:00:00Z"),
        completedAt: new Date("2026-09-20T10:05:00Z"),
      },
    ];
    h.db.agentSession.findMany.mockResolvedValue(rows);

    const res = await GET!(getReq(), ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "s2",
      workflowId: "coach",
      tokensInput: 1200,
      tokensOutput: 300,
      startedAt: "2026-09-20T10:00:00.000Z",
      completedAt: "2026-09-20T10:05:00.000Z",
    });

    const args = h.db.agentSession.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
      take: number;
    };
    expect(args.where).toEqual({ bookId: "b1", userId: "u1", status: "completed" });
    expect(args.orderBy).toEqual({ startedAt: "desc" });
    expect(args.take).toBe(10);
  });

  it("scopes to the caller's own book (404, no session query, for someone else's)", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await GET!(getReq(), ctx);
    expect(res.status).toBe(404);
    expect(h.db.agentSession.findMany).not.toHaveBeenCalled();
    const lookup = h.db.book.findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(lookup.where).toEqual({ id: "b1", userId: "u1" });
  });

  it("clamps the limit: default 10, at most 50, garbage falls back to the default", async () => {
    await GET!(getReq("?limit=999"), ctx);
    await GET!(getReq("?limit=abc"), ctx);
    await GET!(getReq(""), ctx);
    const takes = h.db.agentSession.findMany.mock.calls.map(
      (c) => (c[0] as { take: number }).take
    );
    expect(takes).toEqual([50, 10, 10]);
  });
});

describe("P1-S04: NO_PROVIDER_KEY points at a page that exists", () => {
  it("hands the client /settings#api-keys, not the 404 /settings/api-keys", async () => {
    h.db.apiKey.findMany.mockResolvedValue([]);
    h.resolveProviderRoute.mockReturnValue({ route: "none", error: "no key" });

    const res = await route.POST(postReq() as never, ctx as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; action: { href: string } };
    expect(body.code).toBe("NO_PROVIDER_KEY");
    expect(body.action.href).toBe("/settings#api-keys");
  });
});

describe("P7-S13: book session starts reach the user-keyed ledger", () => {
  it("records the start once the session row exists", async () => {
    const res = await route.POST(postReq() as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.recordAgentSessionStart).toHaveBeenCalledWith("u1");
    const created = h.db.agentSession.create.mock.invocationCallOrder[0];
    const recorded = h.recordAgentSessionStart.mock.invocationCallOrder[0];
    expect(recorded).toBeGreaterThan(created);
  });
});
