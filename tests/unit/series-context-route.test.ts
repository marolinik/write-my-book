import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: { book: { findFirst: vi.fn(), findMany: vi.fn() } },
  sources: {
    getOnStageNames: vi.fn(),
    getPriorCharacters: vi.fn(),
    getOpenThreads: vi.fn(),
    getStyleBaseline: vi.fn(),
    getCurrentChapterMetrics: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/series/ambient-sources", () => h.sources);

import { GET } from "@/app/api/books/[id]/series-context/route";

const ctx = { params: Promise.resolve({ id: "b2" }) };
function req(qs: string) {
  return new Request(`http://t/api/books/b2/series-context${qs}`);
}
// A series owned by the current user (u1). Standalone/cross-user tests override.
const ownedSeriesBook = { id: "b2", bookNumber: 2, seriesId: "s1", series: { id: "s1", title: "Saga", seriesType: "TRILOGY", userId: "u1" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findMany.mockResolvedValue([{ id: "b1", bookNumber: 1 }]);
  h.sources.getOnStageNames.mockResolvedValue(["Milan"]);
  h.sources.getPriorCharacters.mockResolvedValue([
    { bookNumber: 1, name: "Milan", aliases: [], role: "supporting", status: "alive", lastMentioned: 18, description: "d" },
  ]);
  h.sources.getOpenThreads.mockResolvedValue([]);
  h.sources.getStyleBaseline.mockResolvedValue({ metrics: null, baselineBookNumber: null });
  h.sources.getCurrentChapterMetrics.mockResolvedValue(null);
});

describe("GET /series-context", () => {
  it("400s on a missing/invalid chapterNumber", async () => {
    const res = await GET(req("") as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it("401s when auth fails", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    expect(res.status).toBe(401);
  });

  it("404s when the book is not owned", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    expect(res.status).toBe(404);
  });

  it("scopes the ownership lookup by userId (guards against IDOR regression)", async () => {
    h.db.book.findFirst.mockResolvedValue(ownedSeriesBook);
    await GET(req("?chapterNumber=7") as never, ctx as never);
    expect(h.db.book.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "b2", userId: "u1" }) })
    );
  });

  it("scopes the prior-books query by userId (no cross-user prior-book reads)", async () => {
    h.db.book.findFirst.mockResolvedValue(ownedSeriesBook);
    await GET(req("?chapterNumber=7") as never, ctx as never);
    expect(h.db.book.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ seriesId: "s1", userId: "u1" }) })
    );
  });

  it("returns series:null for a standalone book", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b2", bookNumber: 1, seriesId: null, series: null });
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.series).toBeNull();
    expect(json.meta.sourcesAvailable.graph).toBe(true); // NOT a graph outage
  });

  it("hides the sidebar when the series is not owned by the user (defense in depth)", async () => {
    h.db.book.findFirst.mockResolvedValue({
      id: "b2", bookNumber: 2, seriesId: "s1",
      series: { id: "s1", title: "Victim's series", seriesType: "TRILOGY", userId: "someone-else" },
    });
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.series).toBeNull(); // no foreign series metadata leaked
  });

  it("returns a populated envelope on the happy path", async () => {
    h.db.book.findFirst.mockResolvedValue(ownedSeriesBook);
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.series.currentBookNumber).toBe(2);
    expect(json.characters[0].name).toBe("Milan");
    expect(json.meta.sourcesAvailable.graph).toBe(true);
  });

  it("never 500s when getPriorCharacters throws — panel empty, graph flag false", async () => {
    h.db.book.findFirst.mockResolvedValue(ownedSeriesBook);
    h.sources.getPriorCharacters.mockRejectedValue(new Error("neo4j down"));
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.meta.sourcesAvailable.graph).toBe(false);
    expect(json.characters).toEqual([]);
  });

  it("never 500s when getOnStageNames throws (the real full-outage path)", async () => {
    h.db.book.findFirst.mockResolvedValue(ownedSeriesBook);
    h.sources.getOnStageNames.mockRejectedValue(new Error("neo4j down"));
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.meta.sourcesAvailable.graph).toBe(false);
  });

  it("stays 200 with toneDrift null when getCurrentChapterMetrics throws", async () => {
    h.db.book.findFirst.mockResolvedValue(ownedSeriesBook);
    h.sources.getCurrentChapterMetrics.mockRejectedValue(new Error("storage down"));
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.toneDrift).toBeNull();
  });

  it("flags notReady when the current chapter has no on-stage cast", async () => {
    h.db.book.findFirst.mockResolvedValue(ownedSeriesBook);
    h.sources.getOnStageNames.mockResolvedValue([]);
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(json.meta.notReady).toBe(true);
  });
});
