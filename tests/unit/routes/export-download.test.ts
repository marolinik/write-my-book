// P2-64 (Wave 5 Task 6): GET /api/books/:id/export/:filename had no test. It
// serves an exported file from the owner's storage. Only names the exporter
// produces are accepted (sanitizeExportFilename: ASCII stem, a timestamp and
// a known extension), so no traversal and nothing that could break the
// Content-Disposition header.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  findFirst: vi.fn(),
  readBuffer: vi.fn(),
  getBookStorage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => h.user }));
vi.mock("@/lib/db", () => ({ db: { book: { findFirst: h.findFirst } } }));
vi.mock("@/lib/storage", () => ({ getBookStorage: h.getBookStorage }));

import { GET } from "@/app/api/books/[id]/export/[filename]/route";

function call(filename: string) {
  const req = new Request(`http://test/api/books/b1/export/${encodeURIComponent(filename)}`) as unknown as NextRequest;
  return GET(req, { params: Promise.resolve({ id: "b1", filename }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getBookStorage.mockReturnValue({ readBuffer: h.readBuffer });
  h.findFirst.mockResolvedValue({ id: "b1" });
  h.readBuffer.mockResolvedValue(Buffer.from("%PDF-1.7 test"));
});

describe("export download", () => {
  it("serves the owner's file with its content type and an attachment name", async () => {
    const res = await call("The-Salt-Letters-2026-11-12T10-00-00.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="The-Salt-Letters-2026-11-12T10-00-00.pdf"');
    expect(res.headers.get("content-length")).toBe("13");
    expect(h.findFirst).toHaveBeenCalledWith({ where: { id: "b1", userId: "u1" } });
    expect(h.getBookStorage).toHaveBeenCalledWith("u1", "b1");
    expect(h.readBuffer).toHaveBeenCalledWith("exports/The-Salt-Letters-2026-11-12T10-00-00.pdf");
  });

  it.each([
    ["epub", "application/epub+zip"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ])("labels .%s as %s", async (ext, type) => {
    expect((await call(`book.${ext}`)).headers.get("content-type")).toBe(type);
  });

  it.each([
    "../../other-user/exports/book.pdf",
    "..",
    "a/b.pdf",
    "a\\b.pdf",
    'x".pdf',
    "x\r\nSet-Cookie: a=b.pdf",
    "книга.pdf",
    "book.exe",
    "",
  ])("refuses %j with 400 before touching the database or storage", async (name) => {
    expect((await call(name)).status).toBe(400);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.readBuffer).not.toHaveBeenCalled();
  });

  it("answers 404 for another writer's book, without reading storage", async () => {
    h.findFirst.mockResolvedValue(null);
    expect((await call("book.pdf")).status).toBe(404);
    expect(h.readBuffer).not.toHaveBeenCalled();
  });

  it("answers 404 for a file that does not exist", async () => {
    h.readBuffer.mockResolvedValue(null);
    expect((await call("book.pdf")).status).toBe(404);
  });
});

describe("series export download", () => {
  it("applies the same filename rule", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db: { series: { findFirst: h.findFirst } } }));
    vi.doMock("@/lib/storage", () => ({ getSeriesStorage: h.getBookStorage }));
    const { GET: seriesGet } = await import("@/app/api/series/[id]/export/[filename]/route");
    const get = (filename: string) =>
      seriesGet(new Request("http://test/x") as unknown as NextRequest, { params: Promise.resolve({ id: "s1", filename }) });
    expect((await get('x".pdf')).status).toBe(400);
    expect((await get("../b.pdf")).status).toBe(400);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect((await get("Omnibus-2026.epub")).status).toBe(200);
    expect(h.findFirst).toHaveBeenCalledWith({ where: { id: "s1", userId: "u1" } });
  });
});
