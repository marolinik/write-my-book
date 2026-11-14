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
  redisScan: vi.fn(),
  redisMget: vi.fn(),
  stripe: null as null | { customers: { del: (id: string) => unknown } },
  removeAgentJob: vi.fn(),
  customersDel: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/vector", () => ({ deleteBookChunks: (id: string) => h.deleteBookChunks(id) }));
vi.mock("@/lib/graph", () => ({ clearBookGraph: (id: string) => h.clearBookGraph(id) }));
vi.mock("@/lib/storage", () => ({ getStorage: (prefix: string) => ({ prefix }) }));
vi.mock("@/lib/storage/purge", () => ({ purgeStorage: (s: unknown) => h.purgeStorage(s) }));
vi.mock("@/lib/billing", () => ({
  get stripe() {
    return h.stripe;
  },
}));
vi.mock("@/lib/queue/connection", () => ({
  getAppConnection: () => ({
    del: (...k: string[]) => h.redisDel(...k),
    keys: (p: string) => h.redisKeys(p),
    scan: (...a: unknown[]) => h.redisScan(...a),
    mget: (...k: string[]) => h.redisMget(...k),
  }),
}));
vi.mock("@/lib/queue/agent-queue", () => ({
  agentQueue: { getJob: async (id: string) => ({ remove: () => h.removeAgentJob(id) }) },
}));

import { processErasureJob, SESSION_KEY_SUFFIXES } from "@/lib/queue/erasure-worker";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
  h.stripe = { customers: { del: (id: string) => h.customersDel(id) } };
  h.redisScan.mockResolvedValue(["0", []]);
  h.redisMget.mockResolvedValue([]);
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

  it("Wave 7: deletes the session's keys by name, without KEYS", async () => {
    await processErasureJob(job);
    expect(h.redisKeys).not.toHaveBeenCalled();
    expect(h.redisDel).toHaveBeenCalledWith("session:s1:status", "session:s1:messages", "session:s1:cancel");
  });

  it("Wave 7: deletes the approval:{approvalId} keys that belong to the account's sessions, across SCAN pages", async () => {
    h.redisScan
      .mockResolvedValueOnce(["17", ["approval:a1", "approval:a2"]])
      .mockResolvedValueOnce(["0", ["approval:a3", "approval:a4"]]);
    h.redisMget
      .mockResolvedValueOnce([
        JSON.stringify({ status: "pending", sessionId: "s1" }),
        JSON.stringify({ status: "pending", sessionId: "someone-else" }),
      ])
      .mockResolvedValueOnce([JSON.stringify({ status: "modify", sessionId: "s1", message: "the writer's words" }), "not json"]);
    await processErasureJob(job);
    expect(h.redisScan).toHaveBeenCalledWith("0", "MATCH", "approval:*", "COUNT", expect.any(Number));
    expect(h.redisScan).toHaveBeenCalledWith("17", "MATCH", "approval:*", "COUNT", expect.any(Number));
    const deleted = h.redisDel.mock.calls.flat();
    expect(deleted).toEqual(expect.arrayContaining(["approval:a1", "approval:a3"]));
    expect(deleted).not.toContain("approval:a2");
    expect(deleted).not.toContain("approval:a4");
    expect(deleted).not.toContain("approval:s1");
    expect(h.row?.status).toBe("done");
  });

  it("Wave 7: with a Stripe customer but Stripe unconfigured, the Stripe step is NOT done", async () => {
    h.stripe = null;
    await expect(processErasureJob(job)).rejects.toThrow(/stripe/);
    expect(h.row?.status).toBe("pending");
    expect(h.row?.doneStores).not.toContain("stripe");
    expect(h.row?.doneStores).toEqual(expect.arrayContaining(["storage", "redis"]));
  });

  it("Wave 7: with no Stripe customer, an unconfigured Stripe has nothing to erase", async () => {
    h.stripe = null;
    h.row = { ...ROW, stripeCustomerId: null, doneStores: [] };
    await processErasureJob(job);
    expect(h.row?.status).toBe("done");
  });

  it("does nothing for a row that is already done", async () => {
    h.row = { ...ROW, status: "done" };
    await processErasureJob(job);
    expect(h.deleteBookChunks).not.toHaveBeenCalled();
  });
});

describe("session keys erasure knows about (Wave 7)", () => {
  it("every session:{id}:<suffix> key the app writes is in SESSION_KEY_SUFFIXES", () => {
    const src = join(__dirname, "..", "..", "src");
    const found = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "generated") walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          for (const m of readFileSync(full, "utf8").matchAll(/session:\$\{[^}]+\}:([a-z_-]+)/g)) found.add(m[1]);
        }
      }
    };
    walk(src);
    expect(found.size).toBeGreaterThan(0);
    expect([...found].filter((s) => !(SESSION_KEY_SUFFIXES as readonly string[]).includes(s))).toEqual([]);
  });
});
