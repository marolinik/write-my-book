import { describe, it, expect, vi } from "vitest";

/**
 * P6-S02 — importing a DOCX whose prologue is a plain (unstyled) "Prolog"
 * paragraph dropped everything before "# Poglavlje 1": the title page and a
 * 1,816-word prologue vanished, and the preview said nothing. The parser
 * sliced chapters from the first marker on, so lines before it were never
 * emitted, and its prologue detector only knew a "#"-styled "Prolog" although
 * an unstyled "Poglavlje N" line already counts as a chapter.
 *
 * No text is lost now: an unstyled prologue/epilogue line is a marker like an
 * unstyled "Poglavlje N", and whatever still sits before the first marker is
 * kept as its own leading chapter, flagged so the preview can say where it came
 * from (the writer may not want a title page as a chapter).
 */

const h = vi.hoisted(() => ({
  requireUser: vi.fn(async () => ({ id: "u1" })),
  db: {
    book: { findFirst: vi.fn(async () => ({ id: "b1" })) },
    chapter: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/import-export/docx-to-markdown", () => ({ convertDocxToMarkdown: vi.fn() }));

import { parseManuscriptChapters } from "@/lib/import-export/chapter-parser";
import { POST as preview } from "@/app/api/books/[id]/import/preview/route";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const total = (chapters: Array<{ wordCount: number }>) =>
  chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

const PROLOGUE =
  "Prve noći posle sahrane Jelena je čula šapat iz zida. Nije ga razumela, ali ga je prepoznala.";

/** The shape of the UAT manuscript (Rukopis-v2.docx after conversion). */
const RUKOPIS = [
  "Šapat ćutanja — roman",
  "",
  "Prolog",
  "",
  PROLOGUE,
  "",
  "Druga rečenica prologa, i treća.",
  "",
  "# Poglavlje 1",
  "",
  "Jutro je počelo tiho.",
  "",
  "# Poglavlje 2: Kiša",
  "",
  "Kiša je padala danima.",
  "",
  "# Poglavlje 4: Most",
  "",
  "Most je stajao.",
  "",
  "# Epilog",
  "",
  "Kraj.",
].join("\n");

describe("text before the first chapter marker is kept", () => {
  it("the UAT manuscript loses no words", () => {
    const chapters = parseManuscriptChapters(RUKOPIS);
    expect(total(chapters)).toBe(words(RUKOPIS));
  });

  it("an unstyled 'Prolog' line starts the prologue chapter", () => {
    const chapters = parseManuscriptChapters(RUKOPIS);
    const prolog = chapters.find((ch) => ch.title === "Prolog");
    expect(prolog?.content).toContain(PROLOGUE);
    expect(prolog?.beforeFirstHeading).toBeUndefined();
  });

  it("the title page before it is its own flagged chapter, numbered first", () => {
    const chapters = parseManuscriptChapters(RUKOPIS);
    expect(chapters.map((ch) => ch.title)).toEqual([
      "Šapat ćutanja — roman",
      "Prolog",
      "Chapter 1",
      "Kiša",
      "Most",
      "Epilog",
    ]);
    expect(chapters.map((ch) => ch.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chapters[0].beforeFirstHeading).toBe(true);
    expect(chapters[0].content).toBe("Šapat ćutanja — roman");
  });

  it("prose before the first H1 is kept too (heading pass)", () => {
    const md = "Opening words before any heading.\n\n# One\n\nText one.\n\n# Two\n\nText two.";
    const chapters = parseManuscriptChapters(md);
    expect(total(chapters)).toBe(words(md));
    expect(chapters).toHaveLength(3);
    expect(chapters[0]).toMatchObject({
      number: 1,
      title: "Opening words before any heading.",
      beforeFirstHeading: true,
    });
    expect(chapters.map((ch) => ch.number)).toEqual([1, 2, 3]);
  });

  it("a long first line makes a short title, never the whole paragraph", () => {
    const long = "word ".repeat(60).trim();
    const chapters = parseManuscriptChapters(`${long}\n\n# One\n\nA.\n\n# Two\n\nB.`);
    expect(chapters[0].title.length).toBeLessThanOrEqual(81);
    expect(chapters[0].content).toBe(long);
  });

  it("every pass keeps every word", () => {
    const samples = [
      RUKOPIS,
      "Front.\n\n## Part A\n\nText.\n\n## Part B\n\nMore text.",
      "Intro line.\n\nTHE BEGINNING\n\nText.\n\nTHE END\n\nText.",
      "Before.\n\nChapter 1\n\nOne.\n\nChapter 2\n\nTwo.",
      "Just one paragraph, no headings at all.",
    ];
    for (const md of samples) {
      expect(total(parseManuscriptChapters(md)), md.slice(0, 20)).toBe(words(md));
    }
  });
});

describe("nothing changes for a manuscript that starts with a marker", () => {
  it("no extra chapter", () => {
    const md = "# Chapter 1\n\nOne.\n\n# Chapter 2\n\nTwo.";
    const chapters = parseManuscriptChapters(md);
    expect(chapters).toHaveLength(2);
    expect(chapters.some((ch) => ch.beforeFirstHeading)).toBe(false);
  });

  it("blank lines before the first marker are not a chapter", () => {
    const chapters = parseManuscriptChapters("\n\n   \n# Chapter 1\n\nOne.\n\n# Chapter 2\n\nTwo.");
    expect(chapters).toHaveLength(2);
  });

  it("an unstyled prologue at the very top is a marker, not front matter", () => {
    const chapters = parseManuscriptChapters("Prolog\n\nText.\n\nPoglavlje 1\n\nOne.");
    expect(chapters.map((ch) => ch.title)).toEqual(["Prolog", "Chapter 1"]);
    expect(chapters.some((ch) => ch.beforeFirstHeading)).toBe(false);
  });
});

describe("the preview carries the flag to the wizard", () => {
  it("POST /api/books/:id/import/preview returns the kept text, flagged", async () => {
    const form = new FormData();
    form.append("files", new File([RUKOPIS], "Rukopis.md", { type: "text/markdown" }));
    const res = await preview(
      new Request("http://t/api/books/b1/import/preview", { method: "POST", body: form }) as never,
      { params: Promise.resolve({ id: "b1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chapters[0]).toMatchObject({
      number: 1,
      title: "Šapat ćutanja — roman",
      beforeFirstHeading: true,
    });
    expect(total(body.chapters)).toBe(words(RUKOPIS));
  });
});
