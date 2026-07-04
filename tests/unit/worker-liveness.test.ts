import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the queue module so no real BullMQ Queue / Redis connection is created.
const h = vi.hoisted(() => ({
  getWorkers: vi.fn(),
  getJob: vi.fn(),
}));
vi.mock("@/lib/queue", () => ({
  agentQueue: {
    getWorkers: () => h.getWorkers(),
    getJob: (id: string) => h.getJob(id),
  },
}));

import {
  getActiveWorkerCount,
  assertWorkerLiveness,
  isJobStuckWithoutWorker,
} from "@/lib/health/worker-liveness";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("worker-liveness — readiness probe", () => {
  it("reports the attached worker count", async () => {
    h.getWorkers.mockResolvedValue([{}, {}]);
    await expect(getActiveWorkerCount()).resolves.toBe(2);
  });

  it("passes assertion when at least one worker is attached", async () => {
    h.getWorkers.mockResolvedValue([{}]);
    await expect(assertWorkerLiveness()).resolves.toBeUndefined();
  });

  it("throws (→ readiness 503) when no worker is attached", async () => {
    h.getWorkers.mockResolvedValue([]);
    await expect(assertWorkerLiveness()).rejects.toThrow(/worker/i);
  });
});

describe("worker-liveness — stream watchdog decision", () => {
  it("is stuck: waiting job + zero workers", async () => {
    h.getWorkers.mockResolvedValue([]);
    h.getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue("waiting") });
    await expect(isJobStuckWithoutWorker("s1")).resolves.toBe(true);
  });

  it("is stuck: delayed job + zero workers", async () => {
    h.getWorkers.mockResolvedValue([]);
    h.getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue("delayed") });
    await expect(isJobStuckWithoutWorker("s1")).resolves.toBe(true);
  });

  it("not stuck: a worker is attached even though the job still waits", async () => {
    h.getWorkers.mockResolvedValue([{}]);
    const getState = vi.fn().mockResolvedValue("waiting");
    h.getJob.mockResolvedValue({ getState });
    await expect(isJobStuckWithoutWorker("s1")).resolves.toBe(false);
    // Short-circuits on worker presence — never inspects job state.
    expect(getState).not.toHaveBeenCalled();
  });

  it("not stuck: job already active (being processed)", async () => {
    h.getWorkers.mockResolvedValue([]);
    h.getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue("active") });
    await expect(isJobStuckWithoutWorker("s1")).resolves.toBe(false);
  });

  it("not stuck: job no longer exists (completed/removed)", async () => {
    h.getWorkers.mockResolvedValue([]);
    h.getJob.mockResolvedValue(undefined);
    await expect(isJobStuckWithoutWorker("s1")).resolves.toBe(false);
  });
});
