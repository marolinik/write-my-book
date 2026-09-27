import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The public share page, /share/[token].
 *
 * P4-S21 (UAT 2026-09-25): an expired link, and a valid link opened by a
 * rate-limited client, both answered 404 — and both still delivered the book's
 * CURRENT name to the client, in the page metadata Next streams with the 404.
 * generateMetadata looked the book up for any token that existed; only the
 * page body checked the expiry and the limiter. The two now share one
 * decision.
 *
 * P4-S04 (UAT 2026-09-25): the page is rendered in the book's language (M-6),
 * but the document it sits in is tagged with the VIEWER's language — an
 * account-less reader of a Serbian book got `lang="en-US"` around Serbian text.
 */

const h = vi.hoisted(() => ({
  allow: vi.fn(() => true),
  headers: vi.fn(),
  db: {
    sharedSnapshot: { findUnique: vi.fn(), update: vi.fn() },
    book: { findFirst: vi.fn() },
  },
  loadShareBook: vi.fn(),
  loadShareEditorial: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: h.headers }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/share/snapshot-data", () => ({
  loadShareBook: h.loadShareBook,
  loadShareEditorial: h.loadShareEditorial,
}));
vi.mock("@/lib/share/token", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/share/token")>();
  return { ...actual, publicShareLimiter: { allow: h.allow } };
});

import SharePage, { generateMetadata } from "@/app/share/[token]/page";

const TOKEN = "a".repeat(48);
const SECRET = "Secret Title mugdrkbz";
const params = { params: Promise.resolve({ token: TOKEN }) };

function snapshot(expiresAt: Date | null) {
  return { token: TOKEN, bookId: "b1", kind: "book", createdById: "u1", expiresAt };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.allow.mockReturnValue(true);
  h.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "10.0.0.1" }));
  h.db.sharedSnapshot.update.mockResolvedValue({});
  h.db.book.findFirst.mockResolvedValue({ name: SECRET, language: "sr" });
  h.loadShareBook.mockResolvedValue({
    kind: "book",
    bookName: SECRET,
    bookLanguage: "sr",
    bookGenre: null,
    bookStatusNote: "Najbolji niz: 1",
    series: null,
    wordCount: 1200,
    wordPct: 10,
    chapters: [],
    pctDrafted: 100,
    pctPassed: 0,
    healthScore: null,
    avgBetaScore: null,
    progress: 0,
    findingsByChapter: [],
    findingsTotal: 0,
    analysisHasReport: false,
    readability: null,
    generatedAt: new Date(),
    exportedBy: null,
  });
});

describe("an expired share link (P4-S21)", () => {
  beforeEach(() => {
    h.db.sharedSnapshot.findUnique.mockResolvedValue(snapshot(new Date(Date.now() - 86_400_000)));
  });

  it("does not name the book in its metadata", async () => {
    const meta = await generateMetadata(params);
    expect(JSON.stringify(meta)).not.toContain(SECRET);
    expect(h.db.book.findFirst).not.toHaveBeenCalled();
  });

  it("is not found", async () => {
    await expect(SharePage(params)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("a throttled client (P4-S21)", () => {
  beforeEach(() => {
    h.allow.mockReturnValue(false);
    h.db.sharedSnapshot.findUnique.mockResolvedValue(snapshot(null));
  });

  it("gets no book name in the metadata, and no lookup is made for it", async () => {
    const meta = await generateMetadata(params);
    expect(JSON.stringify(meta)).not.toContain(SECRET);
    expect(h.db.sharedSnapshot.findUnique).not.toHaveBeenCalled();
    expect(h.db.book.findFirst).not.toHaveBeenCalled();
  });

  it("is not found", async () => {
    await expect(SharePage(params)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("a live share link", () => {
  beforeEach(() => {
    h.db.sharedSnapshot.findUnique.mockResolvedValue(snapshot(null));
  });

  it("titles the page with the book, in the book's language (P4-S04)", async () => {
    const meta = await generateMetadata(params);
    expect(meta.title).toBe(`${SECRET} · Prikaz knjige`);
  });

  it("tags its content with the book's language, whoever is reading (P4-S04)", async () => {
    const html = renderToStaticMarkup(await SharePage(params));
    expect(html).toMatch(/<div[^>]*\blang="sr-Latn-RS"[^>]*data-share/);
    expect(html).toContain("Najbolji niz: 1");
  });
});
