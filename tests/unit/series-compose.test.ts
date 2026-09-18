import { describe, it, expect } from "vitest";
import {
  demoteHeadings,
  buildBookSection,
  upsertBookSection,
  composeSeriesDocument,
  type BookSection,
} from "@/lib/series/compose-series-document";

/**
 * O2 — the series documents were a concatenation, not a synthesis. Each book's
 * document was spliced in verbatim under `## Book NN Contributions`, so:
 *   - the book's own `# TITLE` became an h1 nested under an h2,
 *   - the file opened at Book 02 because Book 01 never contributed and nothing
 *     said so,
 *   - a book added later was appended at the end, out of reading order,
 *   - languages mixed between sections with nothing marking the switch.
 */

describe("demoteHeadings", () => {
  it("pushes every heading down so a book's h1 sits under the section's h2", () => {
    const md = "# Bible\n\nIntro.\n\n## Characters\n\n### Marko";
    expect(demoteHeadings(md, 2)).toBe(
      "### Bible\n\nIntro.\n\n#### Characters\n\n##### Marko"
    );
  });

  it("stops at h6 instead of emitting invalid markdown", () => {
    expect(demoteHeadings("##### Deep\n\n###### Deeper", 2)).toBe(
      "###### Deep\n\n###### Deeper"
    );
  });

  it("leaves body text, lists and code fences alone", () => {
    const md = "Text with # hash inside.\n\n- item\n\n```\n# not a heading\n```";
    expect(demoteHeadings(md, 1)).toBe(md);
  });
});

describe("buildBookSection", () => {
  it("heads the section with the book number and name", () => {
    const out = buildBookSection({
      bookNumber: 2,
      bookName: "Zavet",
      content: "# Biblija\n\nTekst.",
      language: "sr",
    });
    expect(out.startsWith("## Book 02 — Zavet")).toBe(true);
    expect(out).toContain("### Biblija");
    expect(out).toContain("Tekst.");
  });

  it("marks the language when the book is not in the series language", () => {
    const out = buildBookSection(
      { bookNumber: 3, bookName: "Third", content: "Body.", language: "de" },
      "sr"
    );
    expect(out).toContain("de");
  });

  it("says nothing about language when it matches the series", () => {
    const out = buildBookSection(
      { bookNumber: 3, bookName: "Zaveštanje", content: "Telo.", language: "sr" },
      "sr"
    );
    expect(out).not.toMatch(/\(sr\)/);
  });
});

describe("upsertBookSection", () => {
  const b1: BookSection = { bookNumber: 1, bookName: "Zakletva", content: "Jedan.", language: "sr" };
  const b2: BookSection = { bookNumber: 2, bookName: "Zavet", content: "Dva.", language: "sr" };
  const b3: BookSection = { bookNumber: 3, bookName: "Zaveštanje", content: "Tri.", language: "sr" };

  it("inserts a late first book BEFORE the ones already there", () => {
    const withTwoThree = composeSeriesDocument({
      title: "Series Bible",
      sections: [b2, b3],
      seriesLanguage: "sr",
      missingBooks: [],
    });
    const out = upsertBookSection(withTwoThree, b1, "sr");
    expect(out.indexOf("Book 01")).toBeGreaterThan(-1);
    expect(out.indexOf("Book 01")).toBeLessThan(out.indexOf("Book 02"));
    expect(out.indexOf("Book 02")).toBeLessThan(out.indexOf("Book 03"));
  });

  it("replaces a book's own section instead of adding a second one", () => {
    const doc = composeSeriesDocument({
      title: "Series Bible",
      sections: [b1, b2],
      seriesLanguage: "sr",
      missingBooks: [],
    });
    const out = upsertBookSection(doc, { ...b2, content: "Novi tekst." }, "sr");
    expect(out.match(/## Book 02/g)?.length).toBe(1);
    expect(out).toContain("Novi tekst.");
    expect(out).not.toContain("Dva.");
  });

  it("keeps the document's own title line", () => {
    const doc = composeSeriesDocument({
      title: "Series Bible",
      sections: [b1],
      seriesLanguage: "sr",
      missingBooks: [],
    });
    expect(upsertBookSection(doc, b2, "sr").startsWith("# Series Bible")).toBe(true);
  });
});

describe("composeSeriesDocument", () => {
  it("orders sections by book number regardless of the order given", () => {
    const out = composeSeriesDocument({
      title: "Series Bible",
      sections: [
        { bookNumber: 3, bookName: "C", content: "c", language: "sr" },
        { bookNumber: 1, bookName: "A", content: "a", language: "sr" },
      ],
      seriesLanguage: "sr",
      missingBooks: [],
    });
    expect(out.indexOf("Book 01")).toBeLessThan(out.indexOf("Book 03"));
  });

  it("names the books that have contributed nothing, so a gap is never silent", () => {
    const out = composeSeriesDocument({
      title: "Series Bible",
      sections: [{ bookNumber: 2, bookName: "Zavet", content: "x", language: "sr" }],
      seriesLanguage: "sr",
      missingBooks: [{ bookNumber: 1, bookName: "Zakletva" }],
    });
    expect(out).toContain("Zakletva");
    expect(out).toContain("Book 01");
    // The gap note comes before the contributed sections.
    expect(out.indexOf("Zakletva")).toBeLessThan(out.indexOf("## Book 02"));
  });

  it("never nests an h1 under a section heading", () => {
    const out = composeSeriesDocument({
      title: "Series Bible",
      sections: [{ bookNumber: 1, bookName: "A", content: "# Book title\n\n## Part", language: "sr" }],
      seriesLanguage: "sr",
      missingBooks: [],
    });
    const h1s = out.match(/^# /gm) ?? [];
    expect(h1s.length).toBe(1);
  });
});
