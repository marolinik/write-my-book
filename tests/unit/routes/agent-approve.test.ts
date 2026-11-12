// P2-64 (Wave 5 Task 6): POST /api/books/:id/agent/:sessionId/approve had no
// test. It resolves an approval gate either in Redis (background job, polled
// by the worker) or on the in-memory orchestrator (inline session).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  findFirst: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn() },
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => h.user }));
vi.mock("@/lib/db", () => ({ db: { agentSession: { findFirst: h.findFirst } } }));
vi.mock("@/lib/queue", () => ({ getAppConnection: () => h.redis }));
vi.mock("@/lib/agents", () => ({ getSession: h.getSession }));

import { POST } from "@/app/api/books/[id]/agent/[sessionId]/approve/route";

function call(body: unknown, sessionId = "s1") {
  const req = new Request("http://test/api/books/b1/agent/s1/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(req, { params: Promise.resolve({ id: "b1", sessionId }) });
}

const APPROVE = { approvalId: "a1", decision: "approve" };

beforeEach(() => {
  vi.clearAllMocks();
  h.redis.set.mockResolvedValue("OK");
});

describe("approve — background session (Redis)", () => {
  beforeEach(() => h.findFirst.mockResolvedValue({ jobId: "job-1" }));

  it("resolves a pending approval that names this session, for the worker to read", async () => {
    h.redis.get.mockResolvedValue(JSON.stringify({ status: "pending", sessionId: "s1" }));
    const res = await call({ ...APPROVE, message: "go" });
    expect(res.status).toBe(200);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: "s1", bookId: "b1", userId: "u1" },
      select: { jobId: true },
    });
    const [key, value, ex, ttl] = h.redis.set.mock.calls[0];
    expect(key).toBe("approval:a1");
    expect(JSON.parse(value)).toEqual({ status: "resolved", decision: "approve", message: "go", sessionId: "s1" });
    expect([ex, ttl]).toEqual(["EX", 600]);
  });

  it("answers 409 for an approval already resolved, and writes nothing", async () => {
    h.redis.get.mockResolvedValue(JSON.stringify({ status: "resolved", sessionId: "s1" }));
    expect((await call(APPROVE)).status).toBe(409);
    expect(h.redis.set).not.toHaveBeenCalled();
  });

  it("answers 404 for an approval that names another session (a leaked id), and writes nothing", async () => {
    h.redis.get.mockResolvedValue(JSON.stringify({ status: "pending", sessionId: "someone-elses" }));
    expect((await call(APPROVE)).status).toBe(404);
    expect(h.redis.set).not.toHaveBeenCalled();
  });

  it("answers 404 for an expired approval", async () => {
    h.redis.get.mockResolvedValue(null);
    expect((await call(APPROVE)).status).toBe(404);
  });
});

describe("approve — ownership and input", () => {
  it("answers 404 for a session that is not this writer's book's, and touches nothing", async () => {
    h.findFirst.mockResolvedValue(null);
    expect((await call(APPROVE)).status).toBe(404);
    expect(h.redis.get).not.toHaveBeenCalled();
    expect(h.getSession).not.toHaveBeenCalled();
  });

  it("answers 400 for an unknown decision and for malformed JSON", async () => {
    h.findFirst.mockResolvedValue({ jobId: "job-1" });
    expect((await call({ approvalId: "a1", decision: "maybe" })).status).toBe(400);
    expect((await call("{not json")).status).toBe(400);
    expect(h.redis.set).not.toHaveBeenCalled();
  });
});

describe("approve — inline session (in memory)", () => {
  beforeEach(() => h.findFirst.mockResolvedValue({ jobId: null }));

  it("resolves on the main orchestrator", async () => {
    const resolveApproval = vi.fn().mockReturnValue(true);
    h.getSession.mockReturnValue({ bookId: "b1", userId: "u1", orchestrator: { resolveApproval }, subOrchestrators: new Map() });
    expect((await call({ ...APPROVE, decision: "reject" })).status).toBe(200);
    expect(resolveApproval).toHaveBeenCalledWith("a1", { decision: "reject", message: undefined });
  });

  it("falls through to a specialist's orchestrator", async () => {
    const sub = { resolveApproval: vi.fn().mockReturnValue(true) };
    h.getSession.mockReturnValue({
      bookId: "b1",
      userId: "u1",
      orchestrator: { resolveApproval: vi.fn().mockReturnValue(false) },
      subOrchestrators: new Map([["spec", sub]]),
    });
    expect((await call(APPROVE)).status).toBe(200);
    expect(sub.resolveApproval).toHaveBeenCalled();
  });

  it("answers 404 when the in-memory session belongs to another writer", async () => {
    const resolveApproval = vi.fn();
    h.getSession.mockReturnValue({ bookId: "b1", userId: "intruder", orchestrator: { resolveApproval }, subOrchestrators: new Map() });
    expect((await call(APPROVE)).status).toBe(404);
    expect(resolveApproval).not.toHaveBeenCalled();
  });

  it("answers 404 when no orchestrator knows the approval", async () => {
    h.getSession.mockReturnValue({
      bookId: "b1",
      userId: "u1",
      orchestrator: { resolveApproval: vi.fn().mockReturnValue(false) },
      subOrchestrators: new Map(),
    });
    expect((await call(APPROVE)).status).toBe(404);
  });
});
