import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * X-S20 — the first series synthesis did not name the books it left out.
 *
 * A sibling counted as "missing" only when it had no book-level document of
 * its own, so a sibling that HAD a story bible but had never been synthesized
 * was silently absent. That is exactly the case O2 was written for (the
 * owner's series opened at Book 02), and the automatic path produces it every
 * time: post-session synthesizes only the book that just finished, once two
 * books have the artifact. On first creation the series document holds one
 * book, so every other book is absent from it and must be named.
 *
 * The note then has to follow the document: once a named book is synthesized,
 * it must stop saying that book has not contributed.
 */

const h = vi.hoisted(() => ({
  books: [] as Array<{ id: string; name: string; bookNumber: number; language: string }>,
  bookDocs: new Map<string, string>(),
  seriesDoc: { current: null as string | null },
  created: vi.fn(),
  updated: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    book: {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
        h.books.find((b) => b.id === where.id) ?? null
      ),
      findMany: vi.fn(async () => [...h.books].sort((a, b) => a.bookNumber - b.bookNumber)),
    },
    series: { findFirst: vi.fn(async () => ({ language: "en" })) },
  },
}));

vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    constructor(
      private userId: string,
      private bookId?: string,
      private seriesId?: string
    ) {}
    async findByType() {
      if (this.seriesId) return h.seriesDoc.current === null ? null : { id: "series-doc" };
      return h.bookDocs.has(this.bookId!) ? { id: `doc-${this.bookId}` } : null;
    }
    async read() {
      if (this.seriesId) return { content: h.seriesDoc.current };
      return { content: h.bookDocs.get(this.bookId!) };
    }
    async create(_type: unknown, content: string) {
      h.seriesDoc.current = content;
      h.created(content);
      return { id: "series-doc" };
    }
    async update(_id: string, content: string) {
      h.seriesDoc.current = content;
      h.updated(content);
      return { id: "series-doc" };
    }
  },
}));

import { synthesizeToSeries } from "@/lib/series/series-synthesizer";
import { upsertBookSection } from "@/lib/series/compose-series-document";

beforeEach(() => {
  vi.clearAllMocks();
  h.books = [
    { id: "b1", name: "The Salt Letters", bookNumber: 1, language: "en" },
    { id: "b2", name: "The Lighthouse", bookNumber: 2, language: "en" },
  ];
  h.bookDocs = new Map([
    ["b1", "# Story Bible\n\n## Characters\n\nMara Quill, salvage captain."],
    ["b2", "# Story Bible\n\n## Characters\n\nTobin Quill, lighthouse keeper."],
  ]);
  h.seriesDoc.current = null;
});

describe("synthesizeToSeries — the first synthesis names every book it leaves out (X-S20)", () => {
  it("names a sibling that has its own bible but has not been synthesized", async () => {
    await synthesizeToSeries("u1", "s1", "b2", 2, "STORY_BIBLE");

    const doc = h.created.mock.calls[0][0] as string;
    expect(doc).toContain("No contribution yet from: Book 01 — The Salt Letters");
    expect(doc).toContain("## Book 02 — The Lighthouse");
  });

  it("still names a sibling that has no bible at all", async () => {
    h.bookDocs.delete("b2");
    await synthesizeToSeries("u1", "s1", "b1", 1, "STORY_BIBLE");

    const doc = h.created.mock.calls[0][0] as string;
    expect(doc).toContain("No contribution yet from: Book 02 — The Lighthouse");
  });

  it("drops a book from the note once it is synthesized, and the note with it", async () => {
    await synthesizeToSeries("u1", "s1", "b2", 2, "STORY_BIBLE");
    await synthesizeToSeries("u1", "s1", "b1", 1, "STORY_BIBLE");

    const doc = h.seriesDoc.current!;
    expect(doc).not.toContain("No contribution yet");
    expect(doc).toContain("## Book 01 — The Salt Letters");
    expect(doc).toContain("## Book 02 — The Lighthouse");
    expect(doc.indexOf("## Book 01")).toBeLessThan(doc.indexOf("## Book 02"));
    expect(doc).not.toMatch(/\n{3,}/);
  });
});

describe("upsertBookSection — keeps the missing-books note true", () => {
  it("removes only the book that just arrived and keeps the rest named", () => {
    const existing = [
      "# Series Bible",
      "",
      "> No contribution yet from: Book 02 — Two, Book 03 — Three, with a comma. What follows covers the other books only.",
      "",
      "",
      "## Book 01 — One",
      "",
      "Body.",
    ].join("\n");
    const out = upsertBookSection(existing, { bookNumber: 2, bookName: "Two", content: "Two body." }, "en");
    expect(out).toContain(
      "> No contribution yet from: Book 03 — Three, with a comma. What follows covers the other books only."
    );
    expect(out).toContain("## Book 02 — Two");
  });

  it("reads a note written in another language (Serbian)", () => {
    const existing = [
      "# Biblija serijala",
      "",
      "> Još nema doprinosa od: Knjiga 02 — Dva. Ono što sledi pokriva samo ostale knjige.",
      "",
      "## Knjiga 01 — Jedan",
      "",
      "Telo.",
    ].join("\n");
    const out = upsertBookSection(existing, { bookNumber: 2, bookName: "Dva", content: "Telo dva." }, "sr");
    expect(out).not.toContain("Još nema doprinosa");
  });
});
