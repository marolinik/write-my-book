// tests/unit/chapter-metrics.test.ts
import { describe, it, expect } from "vitest";
import { computeChapterMetrics } from "@/lib/series/chapter-metrics";

describe("computeChapterMetrics", () => {
  it("returns null for empty or whitespace-only text", () => {
    expect(computeChapterMetrics("")).toBeNull();
    expect(computeChapterMetrics("   \n\n  ")).toBeNull();
  });

  it("counts words per sentence", () => {
    // 2 sentences, 8 words total → 4 words/sentence
    const m = computeChapterMetrics("The cat sat down. A dog ran fast.");
    expect(m).not.toBeNull();
    expect(m!.avgWordsPerSentence).toBeCloseTo(4, 5);
  });

  it("counts sentences per paragraph across blank-line breaks", () => {
    // paragraph A: 2 sentences, paragraph B: 1 sentence → 1.5 sentences/paragraph
    const m = computeChapterMetrics("One two. Three four.\n\nFive six seven.");
    expect(m!.avgSentencesPerParagraph).toBeCloseTo(1.5, 5);
  });

  it("computes dialogue ratio from sentences containing quotes (straight + curly + guillemets)", () => {
    // 1 of 2 sentences has a quote → 0.5
    const m = computeChapterMetrics('He spoke. "Run now!" she cried.');
    expect(m!.dialogueRatio).toBeCloseTo(0.5, 5);
  });

  it("treats a quote-only chapter as fully dialogue", () => {
    const m = computeChapterMetrics('"Hello." "Goodbye."');
    expect(m!.dialogueRatio).toBeCloseTo(1, 5);
  });

  it("splits a dialogue sentence from the following action beat (review fix)", () => {
    // 3 sentences: '"I won't go."' / 'She turned away.' / '"Wait," he said.'
    // The naive /[.!?]+(?:\s|$)/ merges the first two into one — this pins 3.
    const m = computeChapterMetrics('"I won\'t go." She turned away. "Wait," he said.');
    expect(m!.avgSentencesPerParagraph).toBeCloseTo(3, 5); // 3 sentences / 1 paragraph
    expect(m!.avgWordsPerSentence).toBeCloseTo(3, 5);      // 9 words / 3 sentences
  });

  it("ignores markdown headings and scene breaks in counts (review fix)", () => {
    const withMd = "# Chapter One\n\nHe ran fast. She followed.\n\n---\n\nThey stopped.";
    const plain = "He ran fast. She followed.\n\nThey stopped.";
    expect(computeChapterMetrics(withMd)).toEqual(computeChapterMetrics(plain));
  });
});
