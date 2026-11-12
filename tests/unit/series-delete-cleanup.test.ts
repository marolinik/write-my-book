// P2-37: DELETE /api/series/:id detached the books, then deleted the row, in
// two separate writes, and left the series documents, every version object,
// the cover and the omnibus exports in storage forever.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const tx = { book: { updateMany: vi.fn() }, series: { delete: vi.fn() } };
  return {
    tx,
    db: {
      series: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    purge: vi.fn(),
    getSeriesStorage: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({ getSeriesStorage: h.getSeriesStorage }));
vi.mock("@/lib/storage/purge", () => ({ purgeStorage: h.purge }));

import { DELETE } from "@/app/api/series/[id]/route";

const S = "00000000-0000-4000-8000-0000000000aa";
const call = () =>
  DELETE(new NextRequest(`http://test/api/series/${S}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: S }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.db.series.findFirst.mockResolvedValue({ id: S, userId: "u1" });
  h.tx.book.updateMany.mockResolvedValue({ count: 2 });
  h.tx.series.delete.mockResolvedValue({});
  h.getSeriesStorage.mockReturnValue({ prefix: `u1/${S}/series` });
  h.purge.mockResolvedValue({ deleted: 5, failed: 0 });
});

describe("DELETE /api/series/:id", () => {
  it("detaches and deletes in one transaction, then purges the series storage", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
    expect(h.tx.book.updateMany).toHaveBeenCalledWith({ where: { seriesId: S }, data: { seriesId: null } });
    expect(h.tx.series.delete).toHaveBeenCalledWith({ where: { id: S } });
    expect(h.getSeriesStorage).toHaveBeenCalledWith("u1", S);
    expect(h.purge).toHaveBeenCalledTimes(1);
    expect(h.purge.mock.invocationCallOrder[0]).toBeGreaterThan(h.tx.series.delete.mock.invocationCallOrder[0]);
  });

  it("a failed delete purges nothing", async () => {
    h.tx.series.delete.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(h.purge).not.toHaveBeenCalled();
  });

  it("a purge failure after the delete still answers deleted (logged)", async () => {
    h.purge.mockRejectedValue(new Error("s3 down"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });
});
