/**
 * M-4 — `Series.language` was write-once, invisible and unused.
 *
 * It is set when a series is created and never again: no picker exists
 * anywhere, `updateSeriesSchema` did not accept it, and the composer that
 * decides what language a series document is written in ignored the column
 * and guessed from the first sibling book instead. So a writer whose first
 * book happened to be in English got an English-structured series document
 * for a Serbian series, and had no way to say otherwise.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { updateSeriesSchema } from "@/lib/validation";
import { resolveSeriesLanguage } from "@/lib/series/compose-series-document";

describe("a series' language can be changed", () => {
  it("is accepted by the update schema", () => {
    expect(updateSeriesSchema.parse({ language: "sr" })).toEqual({ language: "sr" });
  });

  it("rejects a language the agents cannot write in", () => {
    expect(() => updateSeriesSchema.parse({ language: "xx" })).toThrow();
  });

  it("stays optional, so every other field can be updated alone", () => {
    expect(updateSeriesSchema.parse({ title: "Legat" })).toEqual({ title: "Legat" });
  });
});

describe("the language a series document is written in", () => {
  it("is the series' own, when the series has one", () => {
    expect(resolveSeriesLanguage("sr", "en", "en")).toBe("sr");
  });

  it("falls back to the first book's, for a series created before the column was used", () => {
    expect(resolveSeriesLanguage(null, "sr", "en")).toBe("sr");
  });

  it("falls back to the contributing book's when there are no siblings", () => {
    expect(resolveSeriesLanguage(null, undefined, "sr")).toBe("sr");
  });

  it("is undefined when nothing says otherwise, so the composer keeps its own default", () => {
    expect(resolveSeriesLanguage(null, undefined, undefined)).toBeUndefined();
  });
});

describe("the writer can see and change it", () => {
  it("the synthesizer asks the series, not just the first sibling", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "src", "lib", "series", "series-synthesizer.ts"),
      "utf-8"
    );
    expect(source).toContain("resolveSeriesLanguage");
  });

  it("the series page carries a language picker", () => {
    const page = readFileSync(
      join(__dirname, "..", "..", "src", "app", "(app)", "series", "[seriesId]", "page.tsx"),
      "utf-8"
    );
    expect(page).toContain("SeriesLanguageSection");
  });
});
