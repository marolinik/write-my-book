/**
 * Continuity as a state, not an event.
 *
 * The live net is Cypher over the graph: on the owner's 28-chapter book it
 * held one active flag, and that one matched the word "officer" against
 * "prime minister". The deep check reads the whole book with Sonnet, 100k-400k
 * tokens a run, so it runs rarely. Between the two, a contradiction of the
 * book's own canon could sit for weeks.
 *
 * This asks, per paragraph, against the story bible: does it contradict a
 * fact the bible establishes? Measured on the owner's book with facts flipped
 * inside real paragraphs: rank, year, count and age flips judged 0.63-0.95;
 * the writer's own prose and the unflipped originals at most 0.35; on six
 * held-out chapters, 0 of 101 real paragraphs above 0.5. It misses what has
 * to be inferred ("in Vienna" right after "from Germany"), which stays with
 * the deep check.
 *
 * A flagged paragraph is narrowed to its sentence, so the note points at the
 * line, not at a block of prose.
 */

import { describe, it, expect } from "vitest";
import {
  buildCanonRequests,
  readCanonAnswers,
  selectContradictions,
  buildSentenceRequest,
  pickSentence,
  splitSentences,
  paragraphHash,
} from "@/lib/continuity/canon-check";

const passages = Array.from({ length: 8 }, (_, i) => ({ paragraphNumber: i + 1, text: `Pasus ${i}.` }));

describe("buildCanonRequests", () => {
  it("asks six paragraphs per request, each against the whole bible", () => {
    const requests = buildCanonRequests(passages, "BIBLIJA");
    expect(requests.map((r) => r.passages.length)).toEqual([6, 2]);
    expect(requests[1].state).toEqual({ story_bible: "BIBLIJA", passages: ["Pasus 6.", "Pasus 7."] });
    const q = requests[0].questions.p0;
    expect(q.type).toBe("noul");
    expect(q.instructions).toContain("`passages[0]`");
    expect(q.instructions).toContain("`story_bible`");
  });
});

describe("readCanonAnswers and selectContradictions", () => {
  it("keeps the probability per paragraph and flags from 0.5", () => {
    const judged = readCanonAnswers(
      { p0: { type: "noul", noul: 0.92 }, p1: { type: "noul", noul: 0.35 } },
      passages.slice(0, 2)
    );
    expect(judged).toEqual([
      { paragraphNumber: 1, text: "Pasus 0.", contradiction: 0.92 },
      { paragraphNumber: 2, text: "Pasus 1.", contradiction: 0.35 },
    ]);
    expect(selectContradictions(judged).map((j) => j.paragraphNumber)).toEqual([1]);
  });

  it("skips answers that did not come back", () => {
    expect(readCanonAnswers({ p1: { type: "score", score: 1 } }, passages.slice(0, 2))).toEqual([]);
  });
});

describe("narrowing a flagged paragraph to its sentence", () => {
  const paragraph =
    "Ime mi je Dimitrije Milovanović, major. Ovo pišem u Beogradu, na kraju 1918. godine. Vremena imam do zore.";

  it("splits sentences without breaking on a year's full stop", () => {
    expect(splitSentences(paragraph)).toEqual([
      "Ime mi je Dimitrije Milovanović, major.",
      "Ovo pišem u Beogradu, na kraju 1918. godine.",
      "Vremena imam do zore.",
    ]);
  });

  it("asks per sentence and picks the one most likely to contradict", () => {
    const { state, questions } = buildSentenceRequest(splitSentences(paragraph), "BIBLIJA");
    expect(state.sentences).toHaveLength(3);
    expect(Object.keys(questions)).toEqual(["s0", "s1", "s2"]);
    const picked = pickSentence(
      { s0: { type: "noul", noul: 0.9 }, s1: { type: "noul", noul: 0.2 }, s2: { type: "noul", noul: 0.1 } },
      splitSentences(paragraph)
    );
    expect(picked).toBe("Ime mi je Dimitrije Milovanović, major.");
  });

  it("falls back to no sentence when none stands out", () => {
    const picked = pickSentence(
      { s0: { type: "noul", noul: 0.3 }, s1: { type: "noul", noul: 0.2 } },
      ["a.", "b."]
    );
    expect(picked).toBeNull();
  });
});

describe("paragraphHash", () => {
  it("is stable across spacing and changes with the words", () => {
    expect(paragraphHash("Isto  je.\n")).toBe(paragraphHash("Isto je."));
    expect(paragraphHash("Isto je.")).not.toBe(paragraphHash("Nije isto."));
  });
});
