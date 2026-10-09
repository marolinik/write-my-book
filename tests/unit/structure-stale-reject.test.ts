import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P2-S12 / X-S08 / P7-S18 — a Reject from a stale tab "cancelled" a move that
 * had already been applied.
 *
 * Tab 1 accepts a merge; tab 2 still shows it pending and the writer presses
 * Reject there. The reject wrote `status: rejected` over the applied row with
 * no status check, so the manuscript kept the change, the row claimed it had
 * been refused, and Undo answered "never applied" — the writer's only way back
 * was gone.
 *
 * Only a PENDING move can be decided. Anything else answers 409 not_pending,
 * exactly as a second accept already does, and the row is left alone.
 */

interface MoveRow {
  id: string;
  bookId: string;
  status: string;
  rejectionReason: string | null;
}

const h = vi.hoisted(() => ({
  rows: [] as MoveRow[],
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    structureMove: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
  applyStructureMove: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/structure/apply-move", () => ({
  applyStructureMove: (...a: unknown[]) => h.applyStructureMove(...a),
}));

import { POST as DECIDE } from "@/app/api/books/[id]/structure/moves/[moveId]/decision/route";

const ctx = { params: Promise.resolve({ id: "b1", moveId: "m1" }) };

function reject(reason = "stale tab") {
  return new Request("http://t/x", {
    method: "POST",
    body: JSON.stringify({ decision: "reject", reason }),
  });
}

/** Emulates Prisma's where clause, so a status guard is really exercised. */
function matches(row: MoveRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (value && typeof value === "object" && "in" in value) {
      return (value as { in: unknown[] }).in.includes(actual);
    }
    return actual === value;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rows = [];
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.structureMove.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      h.rows.find((r) => matches(r, where)) ?? null
  );
  h.db.structureMove.updateMany.mockImplementation(
    async ({ where, data }: { where: Record<string, unknown>; data: Partial<MoveRow> }) => {
      const hit = h.rows.filter((r) => matches(r, where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }
  );
});

describe("rejecting a move that is no longer pending", () => {
  it("refuses a stale reject of an APPLIED move with 409 not_pending and leaves it applied", async () => {
    h.rows.push({ id: "m1", bookId: "b1", status: "applied", rejectionReason: null });

    const res = await DECIDE(reject() as never, ctx as never);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "not_pending" });
    // Still applied, so Undo still works.
    expect(h.rows[0].status).toBe("applied");
    expect(h.rows[0].rejectionReason).toBeNull();
  });

  it("refuses to re-decide an undone or failed move too", async () => {
    for (const status of ["undone", "failed", "rejected"]) {
      h.rows = [{ id: "m1", bookId: "b1", status, rejectionReason: null }];
      const res = await DECIDE(reject("again") as never, ctx as never);
      expect(res.status).toBe(409);
      expect(h.rows[0].status).toBe(status);
    }
  });

  it("rejects a drafted trim and drops its draft", async () => {
    h.rows.push({ id: "m1", bookId: "b1", status: "drafted", rejectionReason: null, draft: "x" } as never);
    const res = await DECIDE(reject("ne treba") as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.rows[0]).toMatchObject({ status: "rejected", draft: null });
  });

  it("still rejects a pending move", async () => {
    h.rows.push({ id: "m1", bookId: "b1", status: "pending", rejectionReason: null });

    const res = await DECIDE(reject("Namerno je tako.") as never, ctx as never);

    expect(res.status).toBe(200);
    expect(h.rows[0]).toMatchObject({ status: "rejected", rejectionReason: "Namerno je tako." });
    expect(h.applyStructureMove).not.toHaveBeenCalled();
  });

  it("still 404s a move that is not in this book", async () => {
    h.rows.push({ id: "m1", bookId: "someone-else", status: "pending", rejectionReason: null });

    const res = await DECIDE(reject() as never, ctx as never);

    expect(res.status).toBe(404);
    expect(h.rows[0].status).toBe("pending");
  });
});
