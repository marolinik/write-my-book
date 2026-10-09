import { describe, it, expect } from "vitest";
import { computeBookShape, formatBookMap } from "@/lib/structure/book-shape";

/**
 * Dev editor v2, phase C — the whole book's shape, computed, not read.
 *
 * The live baseline spent 11M (then 4M) input tokens because the architect
 * read most chapters whole to learn what a table of numbers and the first and
 * last lines of each chapter would have told it. These are the numbers.
 */

const w = (n: number, word = "reč") => Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");

const chapters = [
  { id: "c1", chapterNumber: 1, title: "Zakletva", content: `# Poglavlje 1: Zakletva\n\n${w(900, "a")}\n\n◆\n\n„Ko je tu?“ upita ona.\n\n${w(100, "z")}` },
  { id: "c2", chapterNumber: 2, title: "Pustinja", content: `# Poglavlje 2\n\n${w(3000, "b")}` },
  { id: "c3", chapterNumber: 3, title: "Put", content: `${w(400, "c")}\n\n* * *\n\n${w(300, "d")}\n\n---\n\n${w(300, "e")}` },
  { id: "c4", chapterNumber: 4, title: "Kuća", content: `${w(1000, "f")}` },
];

describe("computeBookShape", () => {
  const shape = computeBookShape(chapters);

  it("counts words per chapter and the book's median", () => {
    expect(shape.chapters.map((c) => c.words)).toEqual([1005, 3000, 1000, 1000]);
    expect(shape.medianWords).toBe(1002.5);
    expect(shape.totalWords).toBe(6005);
  });

  it("counts scenes from every scene-break style the books use", () => {
    expect(shape.chapters.map((c) => c.scenes)).toEqual([2, 1, 3, 1]);
  });

  it("places each chapter on the book's timeline as a percentage", () => {
    expect(shape.chapters[0].startsAtPct).toBe(0);
    expect(shape.chapters[1].startsAtPct).toBeCloseTo(16.7, 1);
    expect(shape.chapters[3].startsAtPct).toBeCloseTo(83.3, 1);
  });

  it("flags chapters far from the median", () => {
    expect(shape.chapters[1].flags).toContain("long");
    expect(shape.chapters[0].flags).toEqual([]);
  });

  it("quotes the opening without the heading, and the closing", () => {
    expect(shape.chapters[0].opening.startsWith("a0 a1")).toBe(true);
    expect(shape.chapters[0].opening).not.toContain("Poglavlje");
    expect(shape.chapters[0].closing.endsWith("z99")).toBe(true);
  });

  it("measures dialogue", () => {
    expect(shape.chapters[0].dialogueShare).toBeGreaterThan(0);
    expect(shape.chapters[1].dialogueShare).toBe(0);
  });

  it("survives an empty chapter", () => {
    const s = computeBookShape([{ id: "x", chapterNumber: 1, title: null, content: "" }]);
    expect(s.chapters[0]).toMatchObject({ words: 0, scenes: 0, dialogueShare: null });
  });
});

describe("dialogue in every convention the books use", () => {
  it("counts dash-led dialogue and corner brackets, not only quotation marks", () => {
    const NL = "\n";
    const s = computeBookShape([
      { id: "r", chapterNumber: 1, title: null, content: ["— Куда ты? — спросил он.", "Она молчала.", "— Домой."].join(NL + NL) },
      { id: "z", chapterNumber: 2, title: null, content: ["「你去哪？」他问。", "她没说话。"].join(NL + NL) },
    ]);
    expect(s.chapters[0].dialogueShare).toBeGreaterThan(0.5);
    expect(s.chapters[1].dialogueShare).toBeGreaterThan(0.3);
  });
});

describe("formatBookMap", () => {
  const shape = computeBookShape(chapters);
  const text = formatBookMap(shape, {
    tension: new Map([[2, 3]]),
    hooks: new Map([[1, { opening: 2, ending: 3 }]]),
  });

  it("is a table every chapter number can be cited from", () => {
    for (const c of chapters) expect(text).toContain(`| ${c.chapterNumber} |`);
    expect(text).toContain("1002.5");
  });

  it("carries tension and earlier hook ratings when known", () => {
    expect(text).toMatch(/\| 2 \|[^\n]*\| 3 \|/);
    expect(text).toMatch(/\| 1 \|[^\n]*2\/3/);
  });

  it("quotes every chapter's opening and closing", () => {
    expect(text).toContain("a0 a1");
    expect(text).toContain("z99");
    expect(text).toContain("f999");
  });
});
