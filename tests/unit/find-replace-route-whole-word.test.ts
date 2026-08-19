import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * D-189 (transport half) — the `wholeWord` flag must survive the wire, both
 * ways, or the dialog's toggle is decoration. Locks:
 *   - GET  /api/books/:id/search?wholeWord=1   → findInText(..., wholeWord=true)
 *   - POST /api/books/:id/search/replace {wholeWord:true} → replaceInText(..., true)
 *   - absent flag → false (substring), so existing callers are unchanged
 * The search/replace routes had no direct coverage before this file.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), update: vi.fn() },
    chapter: { findMany: vi.fn(), update: vi.fn() },
  },
  findByType: vi.fn(),
  readPinned: vi.fn(),
  update: vi.fn(),
  findInText: vi.fn(),
  replaceInText: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
    update = h.update;
  },
}));
vi.mock("@/lib/search/find-replace", () => ({
  findInText: (...a: unknown[]) => h.findInText(...a),
  replaceInText: (...a: unknown[]) => h.replaceInText(...a),
}));

import { GET as SEARCH } from "@/app/api/books/[id]/search/route";
import { POST as REPLACE } from "@/app/api/books/[id]/search/replace/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.book.update.mockResolvedValue({});
  h.db.chapter.findMany.mockResolvedValue([
    { id: "ch1", chapterNumber: 1, title: "One", wordCount: 10 },
  ]);
  h.db.chapter.update.mockResolvedValue({});
  h.findByType.mockResolvedValue({ id: "doc1", currentVersion: 2 });
  h.readPinned.mockResolvedValue({ content: "Sam saw the same sample." });
  h.update.mockResolvedValue({ version: { version: 3 } });
  h.findInText.mockReturnValue({ count: 1, snippets: [] });
  h.replaceInText.mockReturnValue({ count: 1, result: "Max saw the same sample." });
});

describe("D-189: wholeWord crosses the wire", () => {
  it("GET search forwards wholeWord=1 to the matcher", async () => {
    const res = await SEARCH(
      new NextRequest("http://t/api/books/b1/search?q=Sam&wholeWord=1"),
      ctx as never
    );
    expect(res.status).toBe(200);
    // findInText(content, q, caseSensitive, wholeWord)
    expect(h.findInText.mock.calls[0][3]).toBe(true);
  });

  it("GET search without the flag stays substring matching", async () => {
    const res = await SEARCH(
      new NextRequest("http://t/api/books/b1/search?q=Sam"),
      ctx as never
    );
    expect(res.status).toBe(200);
    expect(h.findInText.mock.calls[0][3]).toBe(false);
  });

  it("POST replace forwards wholeWord to the replacer", async () => {
    const res = await REPLACE(
      new NextRequest("http://t/api/books/b1/search/replace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ find: "Sam", replace: "Max", wholeWord: true }),
      }),
      ctx as never
    );
    expect(res.status).toBe(200);
    // replaceInText(content, find, replace, caseSensitive, wholeWord)
    expect(h.replaceInText.mock.calls[0][4]).toBe(true);
  });

  it("POST replace without the flag stays substring matching", async () => {
    const res = await REPLACE(
      new NextRequest("http://t/api/books/b1/search/replace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ find: "Sam", replace: "Max" }),
      }),
      ctx as never
    );
    expect(res.status).toBe(200);
    expect(h.replaceInText.mock.calls[0][4]).toBe(false);
  });
});
