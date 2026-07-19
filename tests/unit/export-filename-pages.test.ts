import { describe, it, expect } from "vitest";
import {
  sanitizeExportFilename,
  estimateRenderedPages,
} from "@/lib/import-export/export-pipeline";

// ─── D-46: export filenames must be Unicode-safe, not diacritic-stripped ───
describe("sanitizeExportFilename (D-46)", () => {
  it("transliterates diacritics instead of dropping them (Kőszeg → Koszeg)", () => {
    // The bug: /[^a-zA-Z0-9-_ ]/g stripped ő entirely → "Kszeg".
    expect(sanitizeExportFilename("Kőszeg")).toBe("Koszeg");
  });

  it("preserves plain ASCII titles (spaces → hyphens)", () => {
    expect(sanitizeExportFilename("The Salt Letters")).toBe("The-Salt-Letters");
  });

  it("folds a spread of Latin diacritics to their base letters", () => {
    expect(sanitizeExportFilename("Café Résumé Naïve")).toBe("Cafe-Resume-Naive");
    expect(sanitizeExportFilename("Åsa Grönqvist")).toBe("Asa-Gronqvist");
  });

  it("never emits characters the download route rejects (/ \\ .. )", () => {
    const out = sanitizeExportFilename("a/b\\c..d");
    expect(out).not.toMatch(/[/\\]/);
    expect(out).not.toContain("..");
  });

  it("falls back to a safe stem when nothing survives (non-Latin script)", () => {
    // 日本語 has no ASCII fold here; the stem must not be empty (would yield
    // a filename like "-2026-...docx").
    expect(sanitizeExportFilename("日本語")).toBe("book");
    expect(sanitizeExportFilename("")).toBe("book");
  });
});

// ─── D-61: estimatedPages must track actual rendered pagination ───
describe("estimateRenderedPages (D-61)", () => {
  // The two empirically-measured anchors the model is calibrated on.
  const ANCHORS = [
    { words: 6187, actual: 17 }, // small book (B3 original calibration)
    { words: 81095, actual: 165 }, // "The Kőszeg Manuscript P7" (D-61 live repro)
  ];

  it.each(ANCHORS)(
    "estimates $words words within 15% of $actual actual pages",
    ({ words, actual }) => {
      const est = estimateRenderedPages(words);
      const errorPct = Math.abs(est - actual) / actual;
      expect(errorPct).toBeLessThanOrEqual(0.15);
    }
  );

  it("closes the D-61 gap: 81,095 words no longer estimates the old ~232", () => {
    // Old model ceil(81095/350) = 232 was +40.6% over 165 actual.
    const est = estimateRenderedPages(81095);
    expect(est).toBeLessThan(200);
    expect(est).toBeGreaterThan(150);
  });

  it("is monotonic and non-negative", () => {
    expect(estimateRenderedPages(0)).toBeGreaterThanOrEqual(1);
    expect(estimateRenderedPages(50000)).toBeGreaterThan(estimateRenderedPages(10000));
  });
});
