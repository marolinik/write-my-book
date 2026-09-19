/**
 * H-6 / H-7 — the finished book is in the writer's language, boilerplate and all.
 *
 * The export pipeline printed its own text in English whatever the book was
 * written in: an untitled chapter was headed "Chapter 7" in the body and in the
 * table of contents, the copyright page closed a Serbian novel with "All rights
 * reserved.", and the back matter was headed "About the Author". Typography was
 * configured for English and Serbian only, so a German book exported on US
 * letter with en-US hyphenation and English curly quotes.
 *
 * These strings are keyed by the BOOK's language, not the interface language:
 * the book is the artifact, and it is read by people who never open this app.
 */

import { describe, it, expect } from "vitest";
import {
  getExportStrings,
  chapterHeading,
  actHeading,
} from "@/lib/import-export/export-strings";
import { getExportFormatConfig } from "@/lib/import-export/language-config";
import { applyChapterHeading } from "@/lib/import-export/export-pipeline";
import { BOOK_LANGUAGES } from "@/lib/i18n/book-languages";

describe("the chapter heading a book falls back to", () => {
  it("is in the book's language", () => {
    expect(chapterHeading(7, "sr")).toBe("Poglavlje 7");
    expect(chapterHeading(7, "de")).toBe("Kapitel 7");
    expect(chapterHeading(7, "fr")).toBe("Chapitre 7");
    expect(chapterHeading(7, "en")).toBe("Chapter 7");
  });

  it("reaches the manuscript, which is where the TOC reads it from", () => {
    const out = applyChapterHeading("Prvi red teksta.", 7, undefined, "sr");
    expect(out.startsWith("# Poglavlje 7")).toBe(true);
  });

  it("never overrides a title the writer gave the chapter", () => {
    const out = applyChapterHeading("Tekst.", 7, "Glavnjača", "sr");
    expect(out.startsWith("# Glavnjača")).toBe(true);
  });

  it("covers act dividers too", () => {
    expect(actHeading(2, "sr")).toBe("Čin 2");
    expect(actHeading(2, "en")).toBe("Act 2");
  });
});

describe("the copyright page", () => {
  it("is in the book's language", () => {
    expect(getExportStrings("sr").allRightsReserved).toBe("Sva prava zadržana.");
    expect(getExportStrings("de").allRightsReserved).toBe("Alle Rechte vorbehalten.");
  });

  it("carries a real reproduction notice, not the English one translated by nobody", () => {
    for (const lang of ["sr", "de", "es", "fr", "ru", "zh"]) {
      const s = getExportStrings(lang);
      expect(s.reproductionNotice.length).toBeGreaterThan(40);
      expect(s.reproductionNotice).not.toBe(getExportStrings("en").reproductionNotice);
    }
  });

  it("falls back to English for a language with no table, without throwing", () => {
    expect(getExportStrings("ja").allRightsReserved).toBe("All rights reserved.");
    expect(getExportStrings(null).allRightsReserved).toBe("All rights reserved.");
  });

  it("treats a plain sr and an explicit sr-Latn as the same book language", () => {
    expect(getExportStrings("sr-Latn")).toEqual(getExportStrings("sr"));
  });
});

describe("typography", () => {
  it("does not put a European book on US letter", () => {
    for (const lang of ["sr", "de", "es", "fr", "ru"]) {
      expect(getExportFormatConfig(lang).pageSize, `${lang} page size`).toBe("a4");
    }
  });

  it("hyphenates in the book's own language", () => {
    expect(getExportFormatConfig("de").hyphenationLang).toBe("de-DE");
    expect(getExportFormatConfig("fr").hyphenationLang).toBe("fr-FR");
    expect(getExportFormatConfig("ru").hyphenationLang).toBe("ru-RU");
  });

  it("uses the quotation marks each language actually sets", () => {
    expect(getExportFormatConfig("de").openQuote).toBe("„");
    expect(getExportFormatConfig("fr").openQuote).toBe("«");
    expect(getExportFormatConfig("fr").closeQuote).toBe("»");
    expect(getExportFormatConfig("en").openQuote).toBe("“");
  });

  it("still answers for every creatable book language", () => {
    for (const { code } of BOOK_LANGUAGES) {
      const config = getExportFormatConfig(code);
      expect(config.pageSize, `${code} has no page size`).toBeTruthy();
      expect(config.hyphenationLang, `${code} has no hyphenation`).toBeTruthy();
    }
  });
});
