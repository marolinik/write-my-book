import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-S23 — a book or series created without a `language` became English for a
 * writer whose app is set to Serbian. Both routes fall back to
 * `user.preferredLanguage` (c771357), but `createBookSchema` and
 * `createSeriesSchema` carried `.default("en")`, so zod filled the field before
 * the route ran and the fallback never fired. Book.language is what every agent
 * prompt enforces, so the writer silently got English agents. The New Series
 * form sends no language at all, so every series made in the UI hit this.
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    bookSettings: { create: vi.fn() },
    chapter: { create: vi.fn() },
    series: { create: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/billing/plan-gating", () => ({
  checkPlanAccess: vi.fn(async () => ({ allowed: true })),
}));

import { createBookSchema, createSeriesSchema } from "@/lib/validation";
import { bookLanguageFromPreference } from "@/lib/i18n/book-languages";
import { POST as createBook } from "@/app/api/books/route";
import { POST as createSeries } from "@/app/api/series/route";

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asWriter(preferredLanguage: string | null) {
  h.requireUser.mockResolvedValue({ id: "u1", preferredLanguage });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findFirst.mockResolvedValue(null);
  h.db.book.create.mockImplementation(async ({ data }) => ({
    id: "b1",
    bookNumber: 1,
    ...data,
  }));
  h.db.book.update.mockImplementation(async ({ data }) => ({ id: "b1", ...data }));
  h.db.bookSettings.create.mockResolvedValue({});
  h.db.chapter.create.mockResolvedValue({ id: "c1" });
  h.db.series.create.mockImplementation(async ({ data }) => ({ id: "s1", ...data }));
});

describe("the schemas leave an omitted language for the route to decide", () => {
  it("createBookSchema does not invent English", () => {
    expect(createBookSchema.parse({ name: "A" }).language).toBeUndefined();
  });

  it("createSeriesSchema does not invent English", () => {
    expect(createSeriesSchema.parse({ title: "A" }).language).toBeUndefined();
  });
});

describe("POST /api/books without a language uses the writer's own", () => {
  it("a Serbian writer gets a Serbian book", async () => {
    asWriter("sr");
    const res = await createBook(jsonReq("http://t/api/books", { name: "Knjiga" }) as never);
    expect(res.status).toBe(201);
    expect(h.db.book.create.mock.calls[0][0].data.language).toBe("sr");
  });

  it("an explicit language still wins", async () => {
    asWriter("sr");
    await createBook(jsonReq("http://t/api/books", { name: "Book", language: "de" }) as never);
    expect(h.db.book.create.mock.calls[0][0].data.language).toBe("de");
  });

  it("a region tag stored before normalisation resolves to its book language", async () => {
    asWriter("sr-RS");
    await createBook(jsonReq("http://t/api/books", { name: "Knjiga" }) as never);
    expect(h.db.book.create.mock.calls[0][0].data.language).toBe("sr");
  });

  it("a preference that is not a book language falls back to English, never raw", async () => {
    asWriter("hr");
    await createBook(jsonReq("http://t/api/books", { name: "Knjiga" }) as never);
    expect(h.db.book.create.mock.calls[0][0].data.language).toBe("en");
  });

  it("no preference at all is English", async () => {
    asWriter(null);
    await createBook(jsonReq("http://t/api/books", { name: "Book" }) as never);
    expect(h.db.book.create.mock.calls[0][0].data.language).toBe("en");
  });
});

describe("POST /api/series without a language uses the writer's own", () => {
  it("a Serbian writer gets a Serbian series (the New Series form sends none)", async () => {
    asWriter("sr");
    const res = await createSeries(jsonReq("http://t/api/series", { title: "Serija" }) as never);
    expect(res.status).toBe(201);
    expect(h.db.series.create.mock.calls[0][0].data.language).toBe("sr");
  });

  it("an explicit language still wins", async () => {
    asWriter("sr");
    await createSeries(jsonReq("http://t/api/series", { title: "S", language: "fr" }) as never);
    expect(h.db.series.create.mock.calls[0][0].data.language).toBe("fr");
  });
});

describe("bookLanguageFromPreference", () => {
  it("keeps a book language, strips a region, refuses the rest", () => {
    expect(bookLanguageFromPreference("sr")).toBe("sr");
    expect(bookLanguageFromPreference("fr-CA")).toBe("fr");
    expect(bookLanguageFromPreference("hr")).toBe("en");
    expect(bookLanguageFromPreference("xx")).toBe("en");
    expect(bookLanguageFromPreference(null)).toBe("en");
    expect(bookLanguageFromPreference(undefined)).toBe("en");
  });
});
