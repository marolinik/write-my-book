import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentResult } from "@/lib/agents";

/**
 * D-58 (series inline SSE path): POST /api/series/:id/agent must report the
 * documents that were actually written before a mid-session failure, not a
 * hardcoded empty list. The orchestrator threads the real ids as the 2nd
 * onError argument (orchestrator.ts:261, `onError(err, { documentIds })`);
 * pre-fix the route's `onError(error)` dropped it and passed `documentIds: []`
 * to completeSession — a completion that lies about what was produced.
 *
 * This mirrors the already-approved F7 fix on the book-agent route and the
 * D-58 fix on the /message continuation route.
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
  decryptApiKey: vi.fn(),
  estimateCost: vi.fn(),
  checkQuota: vi.fn(),
  parse: vi.fn(),
  // @/lib/llm seam
  createLLMClient: vi.fn(),
  resolveModelForRole: vi.fn(),
  mapAgentTypeToRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
  // @/lib/agents seam
  getWorkflow: vi.fn(),
  getAgentDefinition: vi.fn(),
  createSession: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  processPostSession: vi.fn(),
  runAgent: vi.fn(),
  // DocumentService seam
  findByType: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/encryption", () => ({ decryptApiKey: (...a: unknown[]) => h.decryptApiKey(...a) }));
vi.mock("@/lib/cost", () => ({ estimateCost: (...a: unknown[]) => h.estimateCost(...a) }));
vi.mock("@/lib/billing/quota-checker", () => ({
  checkQuota: (...a: unknown[]) => h.checkQuota(...a),
}));
vi.mock("@/lib/validation", () => ({
  startSeriesAgentSchema: { parse: (b: unknown) => h.parse(b) },
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType(...a: unknown[]) {
      return h.findByType(...a);
    }
    read(...a: unknown[]) {
      return h.read(...a);
    }
  },
}));
vi.mock("@/generated/prisma/enums", () => ({
  DocumentType: { SERIES_BIBLE: "SERIES_BIBLE", SERIES_ARCHITECTURE: "SERIES_ARCHITECTURE" },
}));
vi.mock("@/lib/llm", () => ({
  createLLMClient: (...a: unknown[]) => h.createLLMClient(...a),
  resolveModelForRole: (...a: unknown[]) => h.resolveModelForRole(...a),
  mapAgentTypeToRole: (...a: unknown[]) => h.mapAgentTypeToRole(...a),
  resolveProviderRoute: (...a: unknown[]) => h.resolveProviderRoute(...a),
}));
vi.mock("@/lib/agents", () => ({
  AgentOrchestrator: class {
    constructor(_opts?: unknown) {}
    runAgent(opts: {
      onError: (e: Error, partial?: { documentIds: string[] }) => Promise<void>;
    }) {
      return h.runAgent(opts);
    }
  },
  getWorkflow: (...a: unknown[]) => h.getWorkflow(...a),
  getAgentDefinition: (...a: unknown[]) => h.getAgentDefinition(...a),
  createSession: (...a: unknown[]) => h.createSession(...a),
  pushMessage: (...a: unknown[]) => h.pushMessage(...a),
  completeSession: (...a: unknown[]) => h.completeSession(...a),
  processPostSession: (...a: unknown[]) => h.processPostSession(...a),
}));

import { POST } from "@/app/api/series/[id]/agent/route";

const ctx = { params: Promise.resolve({ id: "series1" }) };
const req = () =>
  new Request("http://t/api/series/series1/agent", {
    method: "POST",
    body: JSON.stringify({ workflowId: "series-planning", bookId: "b1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.parse.mockReturnValue({ workflowId: "series-planning", bookId: "b1" });
  h.db.series.findFirst.mockResolvedValue({ id: "series1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", settings: null });
  h.checkQuota.mockResolvedValue({ allowed: true, currentPlan: "professional" });
  h.getWorkflow.mockReturnValue({
    primaryAgent: "writing-coach",
    estimatedMaxMinutes: 10,
  });
  h.getAgentDefinition.mockReturnValue({ type: "writing-coach" });
  h.db.user.findUnique.mockResolvedValue({ defaultModel: "anthropic/sonnet" });
  h.mapAgentTypeToRole.mockReturnValue("coach");
  h.resolveModelForRole.mockReturnValue({
    registryId: "anthropic/sonnet",
    modelDef: { provider: "anthropic", modelId: "claude-sonnet" },
  });
  h.db.apiKey.findMany.mockResolvedValue([
    { provider: "anthropic", encryptedKey: "enc" },
  ]);
  h.decryptApiKey.mockReturnValue("sk-test");
  h.resolveProviderRoute.mockReturnValue({ route: "direct" });
  h.createLLMClient.mockReturnValue({
    client: {},
    model: { id: "claude-sonnet" },
  });
  h.findByType.mockResolvedValue(null);
  h.read.mockResolvedValue(null);
  h.db.agentSession.create.mockResolvedValue({ id: "s1" });
  h.db.agentSession.update.mockResolvedValue({});
  h.createSession.mockReturnValue({ orchestrator: null as unknown });
  h.estimateCost.mockReturnValue(0);
  h.db.usageRecord.create.mockResolvedValue({});
});

describe("POST /api/series/:id/agent — D-58 error documentIds honesty", () => {
  it("reports the real partial documentIds on error, not an empty list", async () => {
    // The run wrote a doc, then failed — the id is real and must survive.
    h.runAgent.mockImplementation(
      async (opts: {
        onError: (
          e: Error,
          partial?: { documentIds: string[] }
        ) => Promise<void>;
      }) => {
        await opts.onError(new Error("boom"), { documentIds: ["s-doc-1"] });
      }
    );

    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(200);

    await vi.waitFor(() => expect(h.completeSession).toHaveBeenCalled());
    const lastArgs = h.completeSession.mock.calls.at(-1) as [string, AgentResult];
    expect(lastArgs[1].success).toBe(false);
    expect(lastArgs[1].documentIds).toEqual(["s-doc-1"]);
  });
});
