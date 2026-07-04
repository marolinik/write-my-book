import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { GET } from "@/app/api/books/[id]/editorial/summary/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req() {
  return new Request("http://t/api/books/b1/editorial/summary");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
});

describe("GET /api/books/:id/editorial/summary", () => {
  it("returns the pending count under the `pending` field (StoryHealthDashboard's findings-health pillar reads this exact field)", async () => {
    h.db.editFinding.groupBy
      .mockResolvedValueOnce([{ severity: "high", _count: { id: 3 } }]) // severityGroups
      .mockResolvedValueOnce([
        { status: "pending", _count: { id: 3 } },
        { status: "applied", _count: { id: 2 } },
      ]) // statusGroups
      .mockResolvedValueOnce([{ chapterNumber: 1 }, { chapterNumber: 2 }]); // chaptersWithPending

    const res = await GET(req() as never, ctx as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Regression guard: a prior consumer read `pendingCount`, which the route
    // never returns, silently pinning that metric to 0 findings / 100% health.
    expect(body.pendingCount).toBeUndefined();
    expect(body.pending).toBe(3);
    expect(body.total).toBe(5);
    expect(body.chaptersWithPending).toBe(2);
  });

  it("defaults pending to 0 when there are no findings at all", async () => {
    h.db.editFinding.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await GET(req() as never, ctx as never);
    const body = await res.json();
    expect(body.pending).toBe(0);
  });
});
