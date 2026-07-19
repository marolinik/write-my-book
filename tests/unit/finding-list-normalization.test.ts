import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-41a: the list route must not hand the client a blank replacement dressed up
 * as an applicable one. A blank (empty/whitespace) newText is normalized to null
 * so the client's `!!(originalText && newText)` auto-apply check reads false —
 * no "auto-apply" badge, no blank diff, no destructive Apply button. The finding
 * still surfaces (description + Discuss); only the empty "fix" is suppressed.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { GET } from "@/app/api/books/[id]/editorial/findings/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
const req = () => new Request("http://t/books/b1/editorial/findings");

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
});

describe("GET findings — blank newText normalization (D-41a)", () => {
  it("nulls whitespace-only and empty newText but preserves real replacements", async () => {
    h.db.editFinding.findMany.mockResolvedValue([
      { id: "w", originalText: "x", newText: "   ", alternatives: null },
      { id: "e", originalText: "y", newText: "", alternatives: null },
      { id: "r", originalText: "z", newText: "a real fix", alternatives: null },
      { id: "a", originalText: null, newText: null, alternatives: null },
    ]);
    h.db.editFinding.count.mockResolvedValue(4);

    const res = await GET(req() as never, ctx as never);
    const json = await res.json();
    const byId = Object.fromEntries(json.findings.map((f: { id: string; newText: unknown }) => [f.id, f.newText]));

    expect(byId.w).toBeNull(); // whitespace → null
    expect(byId.e).toBeNull(); // empty → null
    expect(byId.r).toBe("a real fix"); // preserved
    expect(byId.a).toBeNull(); // already null, stays null
    expect(json.total).toBe(4);
  });
});
