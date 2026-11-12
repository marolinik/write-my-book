import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Z3 regression lock: POST /api/series/:id/agent must apply the same
 * plan/quota gate as the book-agent route. Pre-fix the series route never
 * called checkQuota, so an inactive subscription could start series agent
 * sessions (tier-gate bypass). RED-pre-fix: checkQuota was never invoked and
 * the route proceeded past the gate.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    series: { findFirst: vi.fn() },
    book: { findFirst: vi.fn() },
  },
  checkQuota: vi.fn(),
  parse: vi.fn(),
  getWorkflow: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/quota-checker", () => ({
  checkQuota: (...a: unknown[]) => h.checkQuota(...a),
}));
// Stub heavy import seams so the module loads; none should be reached when the
// gate denies (the gate is before workflow resolution).
vi.mock("@/lib/encryption", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/lib/cost", () => ({ estimateCost: vi.fn() }));
vi.mock("@/lib/documents/document-service", () => ({ DocumentService: {} }));
vi.mock("@/generated/prisma/enums", () => ({ DocumentType: {} }));
vi.mock("@/lib/llm", () => ({
  createLLMClient: vi.fn(),
  resolveModelForRole: vi.fn(),
  mapAgentTypeToRole: vi.fn(),
  resolveProviderRoute: vi.fn(),
}));
vi.mock("@/lib/agents", () => ({
  AgentOrchestrator: class {},
  getWorkflow: (...a: unknown[]) => h.getWorkflow(...a),
  getAgentDefinition: vi.fn(),
  createSession: vi.fn(),
  pushMessage: vi.fn(),
  completeSession: vi.fn(),
  processPostSession: vi.fn(),
}));

import { POST } from "@/app/api/series/[id]/agent/route";

// P2-71: the real startSeriesAgentSchema runs, so the book id is a UUID.
const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: "series1" }) };
const req = () =>
  new Request("http://t/api/series/series1/agent", {
    method: "POST",
    body: JSON.stringify({ workflowId: "w", bookId: BOOK_ID }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.series.findFirst.mockResolvedValue({ id: "series1" });
  h.db.book.findFirst.mockResolvedValue({ id: BOOK_ID });
});

describe("Z3: series-agent plan/quota gate", () => {
  it("429s when quota is denied — checkQuota IS consulted, workflow is NOT resolved", async () => {
    h.checkQuota.mockResolvedValue({
      allowed: false,
      reason: "Your subscription is inactive.",
      currentPlan: "none",
    });
    const res = await POST(req() as never, ctx as never);
    expect(res.status).toBe(429);
    expect(h.checkQuota).toHaveBeenCalledWith("u1", "use_agent_session");
    expect(h.getWorkflow).not.toHaveBeenCalled();
  });

  it("passes the gate when quota is allowed", async () => {
    h.checkQuota.mockResolvedValue({ allowed: true, currentPlan: "professional" });
    // Unknown workflow → route returns its own 4xx AFTER the gate; the point is
    // the gate did not block an active subscription.
    h.getWorkflow.mockReturnValue(undefined);
    const res = await POST(req() as never, ctx as never);
    expect(h.checkQuota).toHaveBeenCalled();
    expect(res.status).not.toBe(429);
  });
});

// P2-71 (Wave 5 Task 8): with the real schema, an invalid body is refused
// before anything else runs, and the 400 carries only plain messages.
describe("series-agent body validation (real schema)", () => {
  it("answers 400 for a non-UUID book id before the quota gate, without raw Zod internals", async () => {
    const res = await POST(
      new Request("http://t/api/series/series1/agent", {
        method: "POST",
        body: JSON.stringify({ workflowId: "w", bookId: "b1" }),
      }) as never,
      ctx as never
    );
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/"code"\s*:\s*"invalid_|"expected"\s*:|"received"\s*:/);
    expect(h.checkQuota).not.toHaveBeenCalled();
  });
});
