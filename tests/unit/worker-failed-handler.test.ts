// P1-14 / P1-15: a job that failed outside the processor (stall limit) left
// its AgentSession "running" forever with no terminal SSE event; a retried
// attempt of a session that already finished ran it again, and every attempt
// re-persisted the writer's message. The worker now marks such sessions
// terminal, a reaper flips stranded rows, and a retry never redoes a
// finished session.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findMany: vi.fn(),
  redis: { set: vi.fn(), rpush: vi.fn(), expire: vi.fn(), publish: vi.fn() },
  getJob: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { agentSession: { updateMany: h.updateMany, findMany: h.findMany } },
}));
vi.mock("@/lib/queue/connection", () => ({ getAppConnection: () => h.redis }));
vi.mock("@/lib/queue/agent-queue", () => ({ agentQueue: { getJob: (id: string) => h.getJob(id) } }));

import { markSessionTerminal, reapStrandedSessions, isFinalFailure } from "@/lib/queue/session-terminal";
import { decodeLiveEvent } from "@/lib/queue/session-stream";

beforeEach(() => {
  vi.clearAllMocks();
  h.updateMany.mockResolvedValue({ count: 1 });
  h.redis.rpush.mockResolvedValue(3);
});

describe("markSessionTerminal", () => {
  it("flips a non-terminal row, sets the Redis status and publishes a terminal error", async () => {
    await markSessionTerminal("s1", "failed", "The background worker stopped while running this session.");
    expect(h.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", status: { in: ["queued", "running"] } },
      data: expect.objectContaining({ status: "failed" }),
    });
    expect(h.redis.set).toHaveBeenCalledWith("session:s1:status", "failed", "EX", expect.any(Number));
    const published = decodeLiveEvent(String(h.redis.publish.mock.calls[0][1]));
    expect(JSON.parse(published.data)).toMatchObject({ type: "error" });
  });
});

describe("isFinalFailure", () => {
  it("is final on the last attempt, or for an unrecoverable error", () => {
    expect(isFinalFailure({ attemptsMade: 3, opts: { attempts: 3 } }, new Error("x"))).toBe(true);
    expect(isFinalFailure({ attemptsMade: 1, opts: { attempts: 3 } }, new Error("x"))).toBe(false);
    const stall = Object.assign(new Error("job stalled more than allowable limit"), { name: "UnrecoverableError" });
    expect(isFinalFailure({ attemptsMade: 1, opts: { attempts: 3 } }, stall)).toBe(true);
  });
});

describe("reapStrandedSessions", () => {
  it("fails a running row whose job is gone or no longer active, and leaves an active one alone", async () => {
    h.findMany.mockResolvedValue([
      { id: "s-gone", jobId: "s-gone" },
      { id: "s-failed", jobId: "s-failed" },
      { id: "s-active", jobId: "s-active" },
    ]);
    h.getJob.mockImplementation(async (id: string) => {
      if (id === "s-gone") return undefined;
      return { isActive: async () => id === "s-active", isWaiting: async () => false, isDelayed: async () => false };
    });
    const reaped = await reapStrandedSessions(new Date("2026-11-11T12:00:00Z"));
    expect(reaped).toEqual(["s-gone", "s-failed"]);
  });
});

describe("the worker", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src", "worker.ts"), "utf-8");
  const agentWorker = readFileSync(join(__dirname, "..", "..", "src", "lib", "queue", "agent-worker.ts"), "utf-8");

  it("marks a finally-failed job's session terminal and runs the reaper", () => {
    expect(src).toMatch(/worker\.on\("failed"[\s\S]{0,600}isFinalFailure\([\s\S]{0,300}markSessionTerminal\(/);
    expect(src).toContain("reapStrandedSessions(");
  });

  it("a retry never redoes a finished session, and persists the writer's message once", () => {
    expect(agentWorker).toMatch(/SESSION_TERMINAL_STATUSES\.has\(/);
    expect(agentWorker).toMatch(/if \(message && job\.attemptsMade === 0\)/);
  });
});

describe("docker compose", () => {
  it("gives the worker time to finish its job on redeploy", () => {
    for (const file of ["docker-compose.yml", "docker-compose.prod.yml"]) {
      const compose = readFileSync(join(__dirname, "..", "..", file), "utf-8");
      const start = compose.indexOf("\n  worker:");
      const next = compose.slice(start + 1).search(/\r?\n {2}[a-z][\w-]*:\r?\n/);
      const worker = compose.slice(start, next > 0 ? start + 1 + next : undefined);
      expect(worker).toMatch(/stop_grace_period: \d+m/);
    }
  });
});
