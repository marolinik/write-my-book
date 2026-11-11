// P1-16 / P2-32: a job queued behind a busy worker was shown as a worker
// outage after one 10 s probe, and the advised retry duplicated it; with
// Redis down, session start hung and left a "running" row with no job that
// also held the writer's Free session and concurrency slot. The queue
// position is now streamed, and a failed enqueue rolls the start back.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const h = vi.hoisted(() => ({
  getJob: vi.fn(),
  getWaiting: vi.fn(),
  enqueue: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
  usageUpdateMany: vi.fn(),
}));

vi.mock("@/lib/queue/agent-queue", () => ({
  agentQueue: { getJob: (id: string) => h.getJob(id), getWaiting: () => h.getWaiting() },
  enqueueAgentJob: (data: unknown) => h.enqueue(data),
}));
vi.mock("@/lib/db", () => ({
  db: {
    agentSession: { delete: h.deleteSession, update: h.updateSession },
    freeTierUsage: { updateMany: h.usageUpdateMany },
  },
}));

import { queuePosition, enqueueOrRollback } from "@/lib/queue/queue-status";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queuePosition", () => {
  it("is the 1-based place in line of a waiting job", async () => {
    h.getJob.mockResolvedValue({ getState: async () => "waiting" });
    // BullMQ lists the newest waiting job first.
    h.getWaiting.mockResolvedValue([{ id: "newest" }, { id: "s1" }, { id: "oldest" }]);
    expect(await queuePosition("s1")).toBe(2);
  });

  it("is null once the job is running", async () => {
    h.getJob.mockResolvedValue({ getState: async () => "active" });
    expect(await queuePosition("s1")).toBeNull();
  });
});

describe("enqueueOrRollback", () => {
  const input = { sessionId: "s1", userId: "u1", jobData: { sessionId: "s1" } as never };

  it("records the job id when the enqueue succeeds", async () => {
    h.enqueue.mockResolvedValue({ id: "s1" });
    expect(await enqueueOrRollback(input)).toEqual({ ok: true, jobId: "s1" });
    expect(h.updateSession).toHaveBeenCalledWith({ where: { id: "s1" }, data: { jobId: "s1" } });
  });

  it("with Redis down: no session row left behind and the Free session given back", async () => {
    h.enqueue.mockImplementation(() => new Promise(() => {})); // hangs like an offline Redis
    const started = Date.now();
    const result = await enqueueOrRollback({ ...input, timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(result).toEqual({ ok: false });
    expect(h.deleteSession).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(h.usageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "u1", agentSessions: { gt: 0 } }),
        data: { agentSessions: { decrement: 1 } },
      })
    );
  });
});

describe("the routes", () => {
  const SRC = join(__dirname, "..", "..", "src");
  it("session start answers 503 QUEUE_UNAVAILABLE through enqueueOrRollback", () => {
    const route = readFileSync(join(SRC, "app", "api", "books", "[id]", "agent", "route.ts"), "utf-8");
    expect(route).toContain("enqueueOrRollback(");
    expect(route).toContain('"QUEUE_UNAVAILABLE"');
  });

  it("the stream re-arms its watchdog and reports the queue position while waiting", () => {
    const route = readFileSync(
      join(SRC, "app", "api", "books", "[id]", "agent", "[sessionId]", "stream", "route.ts"),
      "utf-8"
    );
    expect(route).toContain("queuePosition(");
    expect(route).toMatch(/setTimeout\(checkQueue, WATCHDOG_INTERVAL_MS\)/);
  });

  it("request-path Redis calls have a command timeout", () => {
    const connection = readFileSync(join(SRC, "lib", "queue", "connection.ts"), "utf-8");
    expect(connection).toMatch(/commandTimeout: \d+/);
  });
});
