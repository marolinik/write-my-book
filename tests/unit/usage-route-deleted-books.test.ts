// P1-9 follow-on: usage rows now outlive their book (bookId SetNull). The
// usage page must keep counting that spend, as one "deleted" entry with no
// link, instead of indexing a map with null or linking to /books/null.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  bookFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({
  db: {
    usageRecord: { findMany: h.findMany },
    book: { findMany: h.bookFindMany },
    agentSession: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/billing/billed-usage", () => ({
  BILLED_ONLY: { billed: true },
  discardedTotals: async () => ({ costEstimate: 0, sessions: 0 }),
}));
vi.mock("@/lib/llm/price-validator", () => ({ validatePrices: async () => {} }));

import { GET } from "@/app/api/usage/route";

const row = (bookId: string | null, cost: number) => ({
  bookId,
  model: "m",
  agentType: "coach",
  tokensInput: 10,
  tokensOutput: 5,
  costEstimate: cost,
  keySource: "platform",
  billed: true,
  recordedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  h.bookFindMany.mockResolvedValue([{ id: "b1", name: "Live Book" }]);
});

describe("GET /api/usage with spend from deleted books", () => {
  it("keeps it as one entry with no book id, and asks only for live books", async () => {
    h.findMany.mockResolvedValue([row("b1", 1), row(null, 2), row(null, 3)]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const deleted = body.byBook.find((b: { bookId: string | null }) => b.bookId === null);
    expect(deleted).toMatchObject({ costEstimate: 5, sessions: 2 });
    expect(h.bookFindMany.mock.calls[0][0].where.id.in).toEqual(["b1"]);
  });
});
