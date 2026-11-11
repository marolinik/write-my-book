// P2-46: book delete purged Qdrant fire-and-forget BEFORE the DB transaction,
// so a failed delete cost a live book its memory, and deleteBookChunks
// swallowed every error, so an outage left chunks forever with nothing
// logged. Memory is now purged after the commit, a missing collection counts
// as done, and any other failure is reported.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  order: [] as string[],
  qdrantDelete: vi.fn(),
  transaction: vi.fn(),
  deleteBookChunks: vi.fn(),
}));

describe("deleteBookChunks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doMock("@/lib/vector/qdrant-client", () => ({
      qdrantClient: { delete: (...a: unknown[]) => h.qdrantDelete(...a) },
      WMB_MEMORY_COLLECTION: "wmb_memory",
    }));
  });

  it("reports a Qdrant failure instead of swallowing it", async () => {
    h.qdrantDelete.mockRejectedValue(Object.assign(new Error("Service Unavailable"), { status: 503 }));
    const { deleteBookChunks } = await import("@/lib/vector/cleanup");
    await expect(deleteBookChunks("b1")).rejects.toThrow(/Service Unavailable/);
  });

  it("counts a missing collection as done", async () => {
    h.qdrantDelete.mockRejectedValue(Object.assign(new Error("Not found: Collection `wmb_memory` doesn't exist!"), { status: 404 }));
    const { deleteBookChunks } = await import("@/lib/vector/cleanup");
    await expect(deleteBookChunks("b1")).resolves.toBeUndefined();
  });
});

describe("DELETE /api/books/:id", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    h.order = [];
    vi.doMock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
    vi.doMock("@/lib/db", () => ({
      db: {
        book: { findFirst: async () => ({ id: "b1" }), delete: () => "deleteBook" },
        writerMemory: { deleteMany: () => "deleteMemories" },
        $transaction: (...a: unknown[]) => h.transaction(...a),
      },
    }));
    vi.doMock("@/lib/vector", () => ({
      deleteBookChunks: (id: string) => {
        h.order.push("chunks");
        return h.deleteBookChunks(id);
      },
    }));
    vi.doMock("@/lib/graph", () => ({ clearBookGraph: async () => {} }));
    vi.doMock("@/lib/storage", () => ({ getBookStorage: () => ({}) }));
    vi.doMock("@/lib/storage/purge", () => ({ purgeStorage: async () => ({ deleted: 0, failed: 0 }) }));
    h.transaction.mockImplementation(async () => {
      h.order.push("transaction");
    });
    h.deleteBookChunks.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const call = async () => {
    const { DELETE } = await import("@/app/api/books/[id]/route");
    return DELETE(new NextRequest("http://t/api/books/b1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "b1" }),
    });
  };

  it("purges memory only after the delete commits", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.order).toEqual(["transaction", "chunks"]);
  });

  it("never touches memory when the delete fails", async () => {
    h.transaction.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(h.order).not.toContain("chunks");
  });

  it("still answers 200 when the memory purge fails, and logs the orphaned book", async () => {
    h.deleteBookChunks.mockRejectedValue(new Error("qdrant 503"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("b1"), expect.anything());
  });
});
