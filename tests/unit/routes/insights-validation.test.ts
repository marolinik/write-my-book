// P2-10: the insights routes validate with schemas. Wrong-typed fields are a
// 400 (not a Prisma 500), text is bounded before it reaches every agent
// prompt, and the list is paginated.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  book: { findFirst: vi.fn() },
  bookInsight: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  createInsight: vi.fn(),
  resolveInsight: vi.fn(),
  dismissInsight: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({ db: { book: h.book, bookInsight: h.bookInsight } }));
vi.mock("@/lib/agents/blackboard", () => ({
  createInsight: h.createInsight,
  resolveInsight: h.resolveInsight,
  dismissInsight: h.dismissInsight,
}));

import { GET, POST } from "@/app/api/books/[id]/insights/route";
import { PATCH } from "@/app/api/books/[id]/insights/[insightId]/route";

const BOOK = "00000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: BOOK }) };
const valid = {
  sourceAgentType: "dev-editor",
  insightType: "WARNING",
  domain: "timeline",
  summary: "Ana is in two places on day three.",
  detail: "Chapter 4 puts her in Belgrade; chapter 5 in Novi Sad the same morning.",
};
const post = (body: unknown) =>
  POST(new NextRequest(`http://test/api/books/${BOOK}/insights`, { method: "POST", body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  h.book.findFirst.mockResolvedValue({ id: BOOK });
  h.bookInsight.findMany.mockResolvedValue([]);
  h.bookInsight.count.mockResolvedValue(0);
  h.createInsight.mockResolvedValue({ id: "i1" });
});

describe("POST /api/books/:id/insights", () => {
  it("creates a valid insight with typed fields", async () => {
    const res = await post({ ...valid, targetAgents: ["line-editor"], chapterScope: [4, 5], expiresAt: "2027-01-01" });
    expect(res.status).toBe(201);
    const arg = h.createInsight.mock.calls[0][0];
    expect(arg.chapterScope).toEqual([4, 5]);
    expect(arg.expiresAt).toBeInstanceOf(Date);
  });

  it.each([
    ["chapterScope of strings", { chapterScope: ["four"] }],
    ["targetAgents not an array", { targetAgents: "line-editor" }],
    ["an unparseable expiresAt", { expiresAt: "not a date" }],
    ["an unknown insightType", { insightType: "RANT" }],
    ["a summary over 500 characters", { summary: "x".repeat(501) }],
    ["a detail over 5000 characters", { detail: "x".repeat(5001) }],
    ["too many target agents", { targetAgents: Array.from({ length: 21 }, (_, i) => `a${i}`) }],
  ])("answers 400 for %s and writes nothing", async (_name, patch) => {
    const res = await post({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(h.createInsight).not.toHaveBeenCalled();
  });
});

describe("GET /api/books/:id/insights", () => {
  it("paginates: default 50, offset honoured", async () => {
    await GET(new NextRequest(`http://test/api/books/${BOOK}/insights?offset=50`), ctx);
    expect(h.bookInsight.findMany.mock.calls[0][0]).toMatchObject({ take: 50, skip: 50 });
  });

  it("refuses a limit over 200", async () => {
    const res = await GET(new NextRequest(`http://test/api/books/${BOOK}/insights?limit=5000`), ctx);
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/books/:id/insights/:insightId", () => {
  const patch = (body: unknown) =>
    PATCH(
      new NextRequest(`http://test/x`, { method: "PATCH", body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: BOOK, insightId: "i1" }) }
    );

  beforeEach(() => {
    h.bookInsight.findFirst.mockResolvedValue({ id: "i1" });
    h.bookInsight.findUnique.mockResolvedValue({ id: "i1" });
  });

  it("refuses an unbounded resolvedBy session id", async () => {
    const res = await patch({ action: "resolve", sessionId: "s".repeat(101) });
    expect(res.status).toBe(400);
    expect(h.resolveInsight).not.toHaveBeenCalled();
  });

  it("resolves with a bounded session id", async () => {
    const res = await patch({ action: "resolve", sessionId: "sess-1" });
    expect(res.status).toBe(200);
    expect(h.resolveInsight).toHaveBeenCalledWith("i1", "sess-1");
  });
});
