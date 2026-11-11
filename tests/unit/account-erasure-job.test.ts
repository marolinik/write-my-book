// P1-3 / P2-33 / P2-39: account erasure ran inline after the rows were gone,
// and every store error was swallowed, so an interrupted first delivery left
// the writer's files, memory and graph behind for good (the redelivery found
// no rows and did nothing). It is now a durable row plus a job that retries
// each store until all are done, and it also clears Redis and the Stripe
// customer.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  row: null as null | Record<string, unknown>,
  db: {
    accountErasure: { findUnique: vi.fn(), update: vi.fn() },
  },
  deleteBookChunks: vi.fn(),
  clearBookGraph: vi.fn(),
  purgeStorage: vi.fn(),
  redisDel: vi.fn(),
  redisKeys: vi.fn(),
  removeAgentJob: vi.fn(),
  customersDel: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/vector", () => ({ deleteBookChunks: (id: string) => h.deleteBookChunks(id) }));
vi.mock("@/lib/graph", () => ({ clearBookGraph: (id: string) => h.clearBookGraph(id) }));
vi.mock("@/lib/storage", () => ({ getStorage: (prefix: string) => ({ prefix }) }));
vi.mock("@/lib/storage/purge", () => ({ purgeStorage: (s: unknown) => h.purgeStorage(s) }));
vi.mock("@/lib/billing", () => ({ stripe: { customers: { del: (id: string) => h.customersDel(id) } } }));
vi.mock("@/lib/queue/connection", () => ({
  getAppConnection: () => ({ del: (...k: string[]) => h.redisDel(...k), keys: (p: string) => h.redisKeys(p) }),
}));
vi.mock("@/lib/queue/agent-queue", () => ({
  agentQueue: { getJob: async (id: string) => ({ remove: () => h.removeAgentJob(id) }) },
}));

import { processErasureJob } from "@/lib/queue/erasure-worker";

const ROW = {
  id: "er_1",
  clerkId: "user_c1",
  userId: "u1",
  bookIds: ["b1", "b2"],
  sessionIds: ["s1"],
  stripeCustomerId: "cus_1",
  doneStores: [] as string[],
  status: "pending",
  attempts: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.row = { ...ROW, doneStores: [] };
  h.db.accountErasure.findUnique.mockImplementation(async () => h.row);
  h.db.accountErasure.update.mockImplementation(async (args: { data: Record<string, unknown> }) => {
    h.row = { ...h.row, ...args.data };
    return h.row;
  });
  h.deleteBookChunks.mockResolvedValue(undefined);
  h.clearBookGraph.mockResolvedValue(undefined);
  h.purgeStorage.mockResolvedValue({ deleted: 3, failed: 0 });
  h.redisKeys.mockResolvedValue(["session:s1:messages", "session:s1:status"]);
  h.redisDel.mockResolvedValue(2);
  h.customersDel.mockResolvedValue({ id: "cus_1", deleted: true });
});

const job = { data: { erasureId: "er_1" } } as never;

describe("processErasureJob", () => {
  it("erases every store, the Redis keys and the Stripe customer, then marks the row done", async () => {
    await processErasureJob(job);
    expect(h.deleteBookChunks.mock.calls.map((c) => c[0])).toEqual(["b1", "b2"]);
    expect(h.clearBookGraph.mock.calls.map((c) => c[0])).toEqual(["b1", "b2"]);
    expect(h.purgeStorage).toHaveBeenCalledWith({ prefix: "u1" });
    expect(h.redisDel).toHaveBeenCalled();
    expect(h.removeAgentJob).toHaveBeenCalledWith("s1");
    expect(h.customersDel).toHaveBeenCalledWith("cus_1");
    expect(h.row?.status).toBe("done");
  });

  it("with Qdrant down, throws so the job retries, keeps what succeeded, and does not redo it", async () => {
    h.deleteBookChunks.mockRejectedValue(new Error("qdrant 503"));
    await expect(processErasureJob(job)).rejects.toThrow(/chunks:b1/);
    expect(h.row?.status).toBe("pending");
    expect(h.row?.doneStores).toEqual(expect.arrayContaining(["graph:b1", "graph:b2", "storage", "redis", "stripe"]));

    vi.clearAllMocks();
    h.deleteBookChunks.mockResolvedValue(undefined);
    await processErasureJob(job);
    expect(h.deleteBookChunks).toHaveBeenCalledTimes(2);
    expect(h.clearBookGraph).not.toHaveBeenCalled();
    expect(h.purgeStorage).not.toHaveBeenCalled();
    expect(h.customersDel).not.toHaveBeenCalled();
    expect(h.row?.status).toBe("done");
  });

  it("counts a Stripe customer that is already gone as done", async () => {
    h.customersDel.mockRejectedValue(Object.assign(new Error("No such customer"), { code: "resource_missing" }));
    await processErasureJob(job);
    expect(h.row?.status).toBe("done");
  });

  it("does nothing for a row that is already done", async () => {
    h.row = { ...ROW, status: "done" };
    await processErasureJob(job);
    expect(h.deleteBookChunks).not.toHaveBeenCalled();
  });
});
