/**
 * Setup should not ask what the manuscript already says.
 *
 * A writer who pasted chapter 1 and clicks "Set up with chat" was still asked
 * for genre, premise and protagonist, and for a 200-word sample, while the
 * chapters sat in the book. The facts of the text are read first and handed
 * to the conversation as settled; what the judge is unsure of stays a question.
 *
 * Measured over 13 books: tense read as past at 0.95-1.00 everywhere. Point of
 * view read third-person limited at 0.72-0.99, except two trilogy books whose
 * openings mix registers, at 0.33-0.66: those must be asked. Genre is a label
 * the writer chooses, so it is only ever proposed. A single choice cannot say
 * "historical thriller" (it picked one half), and per-genre yes/no tagged
 * nearly everything "literary".
 */

import { describe, it, expect } from "vitest";
import {
  buildFactsRequest,
  readFacts,
  factsSection,
  MIN_OPENING_CHARS,
} from "@/lib/setup/manuscript-facts";

const choice = (choice: string, confidence: number) => ({ type: "choice", choice, confidence, probabilities: {} });

describe("buildFactsRequest", () => {
  it("asks for point of view, tense and genre over the opening", () => {
    const { state, questions } = buildFactsRequest("x".repeat(20000));
    expect((state.manuscript_opening as string).length).toBe(8000);
    expect(Object.keys(questions).sort()).toEqual(["genre", "pov", "tense"]);
    for (const q of Object.values(questions)) expect(q.type).toBe("choice");
  });
});

describe("readFacts — what counts as settled", () => {
  it("settles point of view and tense only when the judge is sure", () => {
    const facts = readFacts({
      pov: choice("third-limited", 0.97),
      tense: choice("past", 0.99),
      genre: choice("historical", 1.0),
    });
    expect(facts).toEqual({ pov: "third-limited", tense: "past", genre: "historical" });
  });

  it("leaves an unsure point of view to be asked (the trilogy books at 0.33-0.66)", () => {
    const facts = readFacts({ pov: choice("third-omniscient", 0.66), tense: choice("past", 0.97), genre: choice("thriller", 0.4) });
    expect(facts.pov).toBeUndefined();
    expect(facts.genre).toBeUndefined();
    expect(facts.tense).toBe("past");
  });

  it("settles nothing from answers that did not come back", () => {
    expect(readFacts({})).toEqual({});
  });
});

describe("factsSection — what the conversation is told", () => {
  it("names the settled facts and says not to ask them, and proposes genre rather than deciding it", () => {
    const text = factsSection({ pov: "third-limited", tense: "past", genre: "historical" })!;
    expect(text).toContain("third person, limited");
    expect(text).toContain("past tense");
    expect(text).toMatch(/do not ask/i);
    expect(text).toMatch(/propose.*historical/i);
  });

  it("says which facts are still open, so those are asked", () => {
    const text = factsSection({ tense: "past" })!;
    expect(text).toMatch(/point of view.*ask/i);
  });

  it("says nothing when nothing is settled", () => {
    expect(factsSection({})).toBeNull();
  });

  it("needs a real opening to read", () => {
    expect(MIN_OPENING_CHARS).toBeGreaterThanOrEqual(1000);
  });
});
