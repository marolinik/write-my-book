// P2-64: six series routes had no route test (books/[bookId], cover,
// documents/[docId], inherit, report, synthesize). The ownership sweep proves
// they refuse another writer's ids; these pin what each one DOES for its owner
// and the guards in front of it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  db: {
    series: { findFirst: vi.fn(), update: vi.fn() },
    book: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    document: { findFirst: vi.fn() },
  },
  storage: { writeBuffer: vi.fn(), readBuffer: vi.fn(), delete: vi.fn() },
  svc: { read: vi.fn(), update: vi.fn(), delete: vi.fn() },
  series: { checkInheritanceState: vi.fn(), applyInheritance: vi.fn(), listBookContributions: vi.fn(), synthesizeToSeries: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1", preferredLanguage: "en" }) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({ getSeriesStorage: () => h.storage }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    read = h.svc.read;
    update = h.svc.update;
    delete = h.svc.delete;
  },
}));
vi.mock("@/lib/series", () => h.series);

import { DELETE as detachBook } from "@/app/api/series/[id]/books/[bookId]/route";
import { PUT as putCover, GET as getCover } from "@/app/api/series/[id]/cover/route";
import { GET as getDoc, PATCH as patchDoc, DELETE as deleteDoc } from "@/app/api/series/[id]/documents/[docId]/route";
import { GET as getInherit, POST as postInherit } from "@/app/api/series/[id]/inherit/route";
import { GET as getReport } from "@/app/api/series/[id]/report/route";
import { GET as getSynth, POST as postSynth } from "@/app/api/series/[id]/synthesize/route";

const S = "00000000-0000-4000-8000-0000000000aa";
const B = "00000000-0000-4000-8000-0000000000bb";
const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`http://test${url}`, {
    method: init?.method ?? "GET",
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body), headers: { "content-type": "application/json" } } : {}),
  });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.db.series.findFirst.mockResolvedValue({ id: S, userId: "u1", title: "The Salt Trilogy", genre: null, description: null, coverUrl: null });
  h.db.book.findFirst.mockResolvedValue({ id: B, seriesId: S, userId: "u1" });
  h.storage.writeBuffer.mockResolvedValue(undefined);
  h.storage.delete.mockResolvedValue(undefined);
});

describe("DELETE /series/:id/books/:bookId", () => {
  it("detaches the book and resets its number", async () => {
    const res = await detachBook(req(`/api/series/${S}/books/${B}`, { method: "DELETE" }), ctx({ id: S, bookId: B }));
    expect(res.status).toBe(200);
    expect(h.db.book.update).toHaveBeenCalledWith({ where: { id: B }, data: { seriesId: null, bookNumber: 1 } });
  });

  it("refuses a book that is not in this series", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await detachBook(req(`/api/series/${S}/books/${B}`, { method: "DELETE" }), ctx({ id: S, bookId: B }));
    expect(res.status).toBe(404);
    expect(h.db.book.update).not.toHaveBeenCalled();
  });
});

describe("/series/:id/cover", () => {
  const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString("base64");

  it("stores a new cover under a fresh key, then removes the old one", async () => {
    h.db.series.findFirst
      .mockResolvedValueOnce({ id: S, userId: "u1" })
      .mockReturnValueOnce({ then: (f: (s: unknown) => unknown) => Promise.resolve(f({ coverUrl: "cover/old.png" })) });
    const res = await putCover(req(`/api/series/${S}/cover`, { method: "PUT", body: { dataUrl: PNG } }), ctx({ id: S }));
    expect(res.status).toBe(200);
    const { coverUrl } = await res.json();
    expect(coverUrl).toMatch(/^cover\/[0-9a-f-]{36}\.png$/);
    expect(h.storage.writeBuffer).toHaveBeenCalledWith(coverUrl, expect.any(Buffer), "image/png");
    expect(h.storage.delete).toHaveBeenCalledWith("cover/old.png");
  });

  it("refuses an unsupported image type", async () => {
    const gif = "data:image/gif;base64," + Buffer.from("GIF89a").toString("base64");
    const res = await putCover(req(`/api/series/${S}/cover`, { method: "PUT", body: { dataUrl: gif } }), ctx({ id: S }));
    expect(res.status).toBe(400);
    expect(h.storage.writeBuffer).not.toHaveBeenCalled();
  });

  it("GET answers 404 when no cover is set", async () => {
    const res = await getCover(req(`/api/series/${S}/cover`), ctx({ id: S }));
    expect(res.status).toBe(404);
  });
});

describe("/series/:id/documents/:docId", () => {
  it("GET reads through the series-scoped document service", async () => {
    h.svc.read.mockResolvedValue({ content: "Series bible", version: 3 });
    const res = await getDoc(req(`/api/series/${S}/documents/d1`), ctx({ id: S, docId: "d1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ content: "Series bible" });
  });

  it("PATCH refuses a document of another series", async () => {
    h.db.document.findFirst.mockResolvedValue(null);
    const res = await patchDoc(req(`/api/series/${S}/documents/d1`, { method: "PATCH", body: { content: "x" } }), ctx({ id: S, docId: "d1" }));
    expect(res.status).toBe(404);
    expect(h.svc.update).not.toHaveBeenCalled();
    expect(h.db.document.findFirst.mock.calls[0][0].where).toEqual({ id: "d1", seriesId: S });
  });

  it("DELETE deletes a document of this series", async () => {
    h.db.document.findFirst.mockResolvedValue({ id: "d1", seriesId: S });
    const res = await deleteDoc(req(`/api/series/${S}/documents/d1`, { method: "DELETE" }), ctx({ id: S, docId: "d1" }));
    expect(res.status).toBe(200);
    expect(h.svc.delete).toHaveBeenCalledWith("d1");
  });
});

describe("/series/:id/inherit", () => {
  it("GET needs a bookId", async () => {
    const res = await getInherit(req(`/api/series/${S}/inherit`), ctx({ id: S }));
    expect(res.status).toBe(400);
  });

  it("POST applies inheritance to a book of this series", async () => {
    h.series.applyInheritance.mockResolvedValue({ applied: ["STORY_BIBLE"] });
    const res = await postInherit(req(`/api/series/${S}/inherit`, { method: "POST", body: { bookId: B } }), ctx({ id: S }));
    expect(res.status).toBe(200);
    expect(h.series.applyInheritance).toHaveBeenCalledWith("u1", S, B, undefined);
  });
});

describe("GET /series/:id/report", () => {
  it("escapes writer-controlled text in the HTML report", async () => {
    h.db.series.findFirst.mockResolvedValue({ id: S, userId: "u1", title: "<script>alert(1)</script>", genre: null, description: null });
    h.db.book.findMany.mockResolvedValue([
      { bookNumber: 1, name: "<img src=x onerror=alert(2)>", status: "drafting", wordCount: 1200, createdAt: new Date(), _count: { chapters: 3, documents: 2 } },
    ]);
    const res = await getReport(req(`/api/series/${S}/report`), ctx({ id: S }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Chapters: 3");
  });
});

describe("/series/:id/synthesize", () => {
  it("GET needs an artifactType", async () => {
    const res = await getSynth(req(`/api/series/${S}/synthesize`), ctx({ id: S }));
    expect(res.status).toBe(400);
  });

  it("POST refuses a book that is not in the series", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await postSynth(
      req(`/api/series/${S}/synthesize`, { method: "POST", body: { bookId: B, bookNumber: 1, artifactType: "STORY_BIBLE" } }),
      ctx({ id: S })
    );
    expect(res.status).toBe(404);
    expect(h.series.synthesizeToSeries).not.toHaveBeenCalled();
  });

  it("POST synthesizes a book's artifact into the series", async () => {
    h.series.synthesizeToSeries.mockResolvedValue(true);
    const res = await postSynth(
      req(`/api/series/${S}/synthesize`, { method: "POST", body: { bookId: B, bookNumber: 1, artifactType: "STORY_BIBLE" } }),
      ctx({ id: S })
    );
    expect(await res.json()).toEqual({ success: true });
  });
});
