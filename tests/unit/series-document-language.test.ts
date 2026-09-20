/**
 * H-2 — English structure baked into a Serbian series document.
 *
 * `buildBookSection` wrote `## Book 01 — Name` whatever language the series
 * was in, and that same heading is the parse anchor `upsertBookSection` uses
 * to find a book's section again. So the heading could not simply be
 * translated: every series document already written carries the English form,
 * and a reader that only understood the new form would append a second
 * section for a book that already had one — silently doubling it.
 *
 * The reader therefore accepts the noun in any supported language, plus the
 * literal English it used to write.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildBookSection,
  composeSeriesDocument,
  upsertBookSection,
} from "@/lib/series/compose-series-document";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const section = (bookNumber: number, bookName: string, content: string) => ({
  bookNumber,
  bookName,
  content,
});

describe("a book section's heading", () => {
  it("names the book in the series language", () => {
    const heading = buildBookSection(section(1, "So za pamćenje", "Telo."), "sr")
      .split("\n")[0];
    expect(heading).toBe(`## ${getUIStrings("sr").workspaceUI.book} 01 — So za pamćenje`);
  });

  it("still writes English for an English series", () => {
    const heading = buildBookSection(section(2, "The Salt Letters", "Body."), "en")
      .split("\n")[0];
    expect(heading).toBe("## Book 02 — The Salt Letters");
  });
});

describe("the reader that finds a book's section again", () => {
  it("finds a section written before the heading was translated", () => {
    const existing = [
      "# Biblija serijala",
      "",
      "## Book 01 — Prva",
      "",
      "Stari tekst.",
      "",
      "## Book 02 — Druga",
      "",
      "Druga knjiga.",
    ].join("\n");

    const updated = upsertBookSection(existing, section(1, "Prva", "Novi tekst."), "sr");

    expect(updated).toContain("Novi tekst.");
    expect(updated).not.toContain("Stari tekst.");
    // One section for book 1, not two.
    expect(updated.match(/^## \S+ 01 /gm)?.length).toBe(1);
    // Book 2's English heading is left exactly as it was found.
    expect(updated).toContain("## Book 02 — Druga");
  });

  it("finds a section written after the heading was translated", () => {
    const existing = composeSeriesDocument({
      title: "Biblija serijala",
      sections: [section(1, "Prva", "Stari tekst."), section(2, "Druga", "Druga knjiga.")],
      seriesLanguage: "sr",
      missingBooks: [],
    });

    const updated = upsertBookSection(existing, section(1, "Prva", "Novi tekst."), "sr");

    expect(updated).toContain("Novi tekst.");
    expect(updated).not.toContain("Stari tekst.");
    expect(updated.match(/^## \S+ 01 /gm)?.length).toBe(1);
  });

  it("keeps book order when a late section is inserted", () => {
    const existing = composeSeriesDocument({
      title: "Biblija serijala",
      sections: [section(1, "Prva", "Prvo."), section(3, "Treća", "Treće.")],
      seriesLanguage: "sr",
      missingBooks: [],
    });

    const updated = upsertBookSection(existing, section(2, "Druga", "Drugo."), "sr");
    const order = [...updated.matchAll(/^## \S+ (\d+) /gm)].map((m) => Number(m[1]));
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("the note about books that have contributed nothing", () => {
  it("is written in the series language", () => {
    const composed = composeSeriesDocument({
      title: "Biblija serijala",
      sections: [section(2, "Druga", "Telo.")],
      seriesLanguage: "sr",
      missingBooks: [{ bookNumber: 1, bookName: "Prva" }],
    });
    expect(composed).not.toContain("No contribution yet from");
    expect(composed).toContain(getUIStrings("sr").workspaceUI.book);
  });
});

describe("the series document's own title", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "src", "lib", "series", "series-synthesizer.ts"),
    "utf-8"
  );

  it("is the document type's label, not the type name with a word in front", () => {
    // `Series ${artifactType.replace(...)}` produced "Series series bible".
    expect(source).not.toMatch(/`Series \$\{artifactType/);
    expect(source).toContain("getDocumentTypeLabels");
  });
});
