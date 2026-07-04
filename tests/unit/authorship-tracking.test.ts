// S11: the "X% yours" authorship readout must never be shown from data that
// was never actually tracked. `data-author` provenance has zero producers, so
// the status bar only ever feeds aiWords:0 / aiEditedWords:0 — which would
// render a fabricated "100% yours" on a fully-AI-drafted chapter. The gate
// hides the readout until real provenance exists.
import { describe, it, expect } from "vitest";
import {
  hasTrackedAuthorship,
  type AuthorshipStats,
} from "@/lib/editor/authorship";

function stats(overrides: Partial<AuthorshipStats> = {}): AuthorshipStats {
  return {
    humanWords: 1000,
    aiWords: 0,
    aiEditedWords: 0,
    totalWords: 1000,
    ...overrides,
  };
}

describe("hasTrackedAuthorship — S11 provenance gate", () => {
  it("is false for the exact stats the status bar feeds today (no tracker wired)", () => {
    // editor-status-bar passes { humanWords: wordCount, aiWords: 0,
    // aiEditedWords: 0, totalWords: wordCount } — the readout must stay hidden.
    expect(hasTrackedAuthorship(stats())).toBe(false);
  });

  it("is false even for an empty chapter with no words", () => {
    expect(
      hasTrackedAuthorship(
        stats({ humanWords: 0, totalWords: 0 })
      )
    ).toBe(false);
  });

  it("is true once AI-generated words are recorded", () => {
    expect(
      hasTrackedAuthorship(stats({ humanWords: 600, aiWords: 400, totalWords: 1000 }))
    ).toBe(true);
  });

  it("is true once AI-edited words are recorded", () => {
    expect(
      hasTrackedAuthorship(stats({ humanWords: 900, aiEditedWords: 100, totalWords: 1000 }))
    ).toBe(true);
  });
});
