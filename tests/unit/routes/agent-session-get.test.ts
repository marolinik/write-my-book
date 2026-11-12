// P2-64 (Wave 5 Task 6): GET /api/books/:id/agent/:sessionId had no test. It
// answers the session's status to the client that remembers it, and settles a
// row left "running" past the hard ceiling instead of reporting it running.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!h.user) throw new Error("Unauthorized");
    return h.user;
  },
}));
vi.mock("@/lib/db", () => ({ db: { agentSession: { findFirst: h.findFirst, update: h.update } } }));

import { GET } from "@/app/api/books/[id]/agent/[sessionId]/route";

const get = () =>
  GET(new Request("http://test/x") as unknown as NextRequest, { params: Promise.resolve({ id: "b1", sessionId: "s1" }) });

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: "u1" };
});

describe("GET session status", () => {
  it("answers the caller's own session", async () => {
    h.findFirst.mockResolvedValue({ id: "s1", status: "completed", startedAt: new Date(Date.now() - HOUR) });
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("completed");
    expect(h.findFirst.mock.calls[0][0].where).toEqual({ id: "s1", bookId: "b1", userId: "u1" });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("leaves a run inside the ceiling running", async () => {
    h.findFirst.mockResolvedValue({ id: "s1", status: "running", startedAt: new Date(Date.now() - 3 * HOUR) });
    expect((await (await get()).json()).status).toBe("running");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("settles a run past the 4-hour ceiling as failed and says it was abandoned", async () => {
    h.findFirst.mockResolvedValue({ id: "s1", status: "running", startedAt: new Date(Date.now() - 5 * HOUR) });
    h.update.mockResolvedValue({ status: "failed", completedAt: new Date() });
    const body = await (await get()).json();
    expect(body).toMatchObject({ status: "failed", abandoned: true });
    expect(h.update.mock.calls[0][0]).toMatchObject({ where: { id: "s1" }, data: { status: "failed" } });
  });

  it("answers 404 for another writer's session and 401 when signed out", async () => {
    h.findFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
    h.user = null;
    expect((await get()).status).toBe(401);
  });
});
