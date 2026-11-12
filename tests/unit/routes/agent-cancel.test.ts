// P2-64 (Wave 5 Task 6): POST /api/books/:id/agent/:sessionId/cancel had no
// test. A background session is stopped through Redis (terminal event, status
// key, cancel flag) and a still-waiting job is removed; an inline one through
// the in-memory registry. Either way the row ends failed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  findFirst: vi.fn(),
  update: vi.fn(),
  redis: { set: vi.fn() },
  appendSessionEvent: vi.fn(),
  getJob: vi.fn(),
  getSession: vi.fn(),
  cancelSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => h.user }));
vi.mock("@/lib/db", () => ({ db: { agentSession: { findFirst: h.findFirst, update: h.update } } }));
vi.mock("@/lib/queue/connection", () => ({ getAppConnection: () => h.redis }));
vi.mock("@/lib/queue/session-stream", () => ({ appendSessionEvent: h.appendSessionEvent }));
vi.mock("@/lib/queue/agent-queue", () => ({ agentQueue: { getJob: h.getJob } }));
vi.mock("@/lib/agents", () => ({ getSession: h.getSession, cancelSession: h.cancelSession }));

import { POST } from "@/app/api/books/[id]/agent/[sessionId]/cancel/route";

function call() {
  const req = new Request("http://test/api/books/b1/agent/s1/cancel", { method: "POST" }) as unknown as NextRequest;
  return POST(req, { params: Promise.resolve({ id: "b1", sessionId: "s1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.redis.set.mockResolvedValue("OK");
  h.update.mockResolvedValue({});
});

describe("cancel", () => {
  it("answers 404 for a session that is not this writer's, and changes nothing", async () => {
    h.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: "s1", bookId: "b1", userId: "u1" },
      select: { jobId: true, status: true },
    });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.redis.set).not.toHaveBeenCalled();
  });

  it.each(["completed", "failed", "cancelled", "skipped"])("is idempotent for a %s session: no write", async (status) => {
    h.findFirst.mockResolvedValue({ jobId: "job-1", status });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyDone: true });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.appendSessionEvent).not.toHaveBeenCalled();
  });

  it("stops a background session: terminal coded event, status key, cancel flag, waiting job removed, row failed", async () => {
    h.findFirst.mockResolvedValue({ jobId: "job-1", status: "queued" });
    const remove = vi.fn();
    h.getJob.mockResolvedValue({ getState: async () => "waiting", remove });
    expect((await call()).status).toBe(200);

    const event = JSON.parse(h.appendSessionEvent.mock.calls[0][2]);
    expect(event).toMatchObject({ type: "error", metadata: { code: "SESSION_CANCELLED" } });
    expect(h.redis.set).toHaveBeenCalledWith("session:s1:status", "failed", "EX", 86400);
    expect(h.redis.set).toHaveBeenCalledWith("session:s1:cancel", "true", "EX", 3600);
    expect(remove).toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "failed", completedAt: expect.any(Date) },
    });
  });

  it("leaves an active job to the worker's cancel flag", async () => {
    h.findFirst.mockResolvedValue({ jobId: "job-1", status: "running" });
    const remove = vi.fn();
    h.getJob.mockResolvedValue({ getState: async () => "active", remove });
    expect((await call()).status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
    expect(h.redis.set).toHaveBeenCalledWith("session:s1:cancel", "true", "EX", 3600);
  });

  it("cancels an inline session in memory, and still marks the row when memory has forgotten it", async () => {
    h.findFirst.mockResolvedValue({ jobId: null, status: "running" });
    h.getSession.mockReturnValue({ id: "s1" });
    expect((await call()).status).toBe(200);
    expect(h.cancelSession).toHaveBeenCalledWith("s1");

    vi.clearAllMocks();
    h.findFirst.mockResolvedValue({ jobId: null, status: "running" });
    h.getSession.mockReturnValue(undefined);
    expect((await call()).status).toBe(200);
    expect(h.cancelSession).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalled();
  });
});
