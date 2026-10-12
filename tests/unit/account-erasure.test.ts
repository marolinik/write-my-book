import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GDPR erasure (launch audit 2026-10-12): deleting an account removed the
 * Postgres rows only. The writer's stored files (S3/MinIO under userId/),
 * memory chunks (Qdrant) and story graph (Neo4j) stayed behind. They must go
 * too, each store best-effort: a fault in one is logged and never stops the
 * others.
 */
const h = vi.hoisted(() => ({
  deleteBookChunks: vi.fn(async (_id: string) => {}),
  clearBookGraph: vi.fn(async (_id: string) => {}),
  getStorage: vi.fn(),
  purgeStorage: vi.fn(async (_s: unknown) => ({ deleted: 3, failed: 0 })),
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/vector", () => ({ deleteBookChunks: (id: string) => h.deleteBookChunks(id) }));
vi.mock("@/lib/graph", () => ({ clearBookGraph: (id: string) => h.clearBookGraph(id) }));
vi.mock("@/lib/storage", () => ({ getStorage: (p: string) => h.getStorage(p) }));
vi.mock("@/lib/storage/purge", () => ({ purgeStorage: (s: unknown) => h.purgeStorage(s) }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));

import { eraseAccountData } from "@/lib/erasure/account-data";

beforeEach(() => {
  vi.clearAllMocks();
  h.getStorage.mockImplementation((p: string) => ({ prefix: p }));
});

describe("eraseAccountData", () => {
  it("removes every book's chunks and graph, and every stored object under the user's prefix", async () => {
    await eraseAccountData({ userId: "u1", bookIds: ["b1", "b2"] });
    expect(h.deleteBookChunks.mock.calls.map((c) => c[0])).toEqual(["b1", "b2"]);
    expect(h.clearBookGraph.mock.calls.map((c) => c[0])).toEqual(["b1", "b2"]);
    expect(h.getStorage).toHaveBeenCalledWith("u1");
    expect(h.purgeStorage).toHaveBeenCalledWith({ prefix: "u1" });
  });

  it("keeps going when one store fails, and logs it", async () => {
    h.clearBookGraph.mockRejectedValueOnce(new Error("neo4j down"));
    h.purgeStorage.mockRejectedValueOnce(new Error("minio down"));
    await expect(eraseAccountData({ userId: "u1", bookIds: ["b1", "b2"] })).resolves.toBeUndefined();
    expect(h.clearBookGraph).toHaveBeenCalledTimes(2);
    expect(h.deleteBookChunks).toHaveBeenCalledTimes(2);
    expect(h.logger.error).toHaveBeenCalled();
  });

  it("logs objects that could not be removed", async () => {
    h.purgeStorage.mockResolvedValueOnce({ deleted: 1, failed: 2 });
    await eraseAccountData({ userId: "u1", bookIds: [] });
    expect(h.logger.error).toHaveBeenCalled();
  });

  it("refuses an empty user id, which would purge the whole bucket", async () => {
    await eraseAccountData({ userId: "", bookIds: [] });
    expect(h.getStorage).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalled();
  });
});
