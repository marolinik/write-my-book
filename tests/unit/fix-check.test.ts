/**
 * An applied note is a promise, and nothing checked whether it was kept.
 *
 * The writer applies a finding and the product marks it done. Whether the
 * changed passage still has the problem the note named was never asked. On
 * the owner's book it mattered twice out of eight: chapter 31's continuity
 * "fix" pasted an editor's bracketed memo into the prose and left the gap
 * open (0.76), and chapter 1's point-of-view fix merged two sentences and
 * kept the boy as the perceiver (0.63). The six that did work judged
 * 0.05-0.43, and the same eight with the passage left unchanged judged
 * 0.80-0.98.
 *
 * An unchanged passage needs no judge: the answer is known.
 */

import { describe, it, expect } from "vitest";
import {
  buildFixCheckRequest,
  readFixCheck,
  fixVerdict,
  unchangedPassage,
} from "@/lib/editorial/fix-check";

const note = {
  category: "pov",
  description: "The last sentence hands the point of view to the boy.",
  suggestion: "Keep the section in the documentary register.",
};

describe("buildFixCheckRequest", () => {
  it("puts the note, the passage before and the passage after in the state", () => {
    const { state, questions } = buildFixCheckRequest({ ...note, before: "B", after: "A" });
    expect(state).toEqual({
      note: { category: "pov", complaint: note.description, suggestion: note.suggestion },
      before: "B",
      after: "A",
    });
    expect(questions.remains.type).toBe("noul");
    expect(questions.remains.instructions).toContain("`after`");
    expect(questions.remains.instructions).toContain("`before`");
  });

  it("does not hand the judge a suggestion that is not there", () => {
    const { state } = buildFixCheckRequest({ ...note, suggestion: null, before: "B", after: "A" });
    expect((state.note as { suggestion: unknown }).suggestion).toBeNull();
  });
});

describe("readFixCheck", () => {
  it("reads the probability the problem remains", () => {
    expect(readFixCheck({ remains: { type: "noul", noul: 0.76 } })).toBe(0.76);
  });

  it("answers null, never a guess, when the answer did not come back", () => {
    expect(readFixCheck({})).toBeNull();
    expect(readFixCheck({ remains: { type: "score", score: 3 } })).toBeNull();
  });
});

describe("unchangedPassage", () => {
  it("knows without a judge that nothing changed, ignoring spacing and quote style", () => {
    expect(unchangedPassage("Rekao je „da”.  ", 'Rekao je "da".')).toBe(true);
    expect(unchangedPassage("Rekao je da.", "Rekao je ne.")).toBe(false);
  });
});

describe("fixVerdict — policy, apart from the judgement", () => {
  it("calls the owner's two failed fixes not held and the six that worked held", () => {
    expect(fixVerdict(0.76)).toBe("not-held");
    expect(fixVerdict(0.63)).toBe("not-held");
    for (const p of [0.05, 0.15, 0.2, 0.32, 0.38, 0.43]) {
      expect(fixVerdict(p)).toBe("held");
    }
  });

  it("says nothing either way about a passage it has not judged", () => {
    expect(fixVerdict(null)).toBe("unchecked");
  });

  it("does not claim either answer in the middle", () => {
    expect(fixVerdict(0.52)).toBe("unsure");
  });
});
