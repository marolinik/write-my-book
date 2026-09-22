/**
 * A check that asks the answerable question.
 *
 * "Did a machine write this paragraph?" was asked first. On held-out chapters
 * it caught 2 of 12 paragraphs DeepSeek wrote and flagged 6 of 125 of the
 * owner's, so it does not ship. "How much of this is stock prose?" can be
 * checked by reading the paragraph, and the owner's verdict on the six it
 * flagged was that they read as stock even where they are his: worth a check.
 *
 * The request shape is part of the contract. Eighteen questions over one long
 * state drifted with position: the same paragraph scored 0.71 first in the
 * list and 2.87 last. Six per request held within 0.3 in either order.
 */

import { describe, it, expect } from "vitest";
import {
  splitPassages,
  buildStockProseRequests,
  readStockProseAnswers,
  selectForCheck,
  STOCK_PROSE_LEVELS,
  PASSAGES_PER_REQUEST,
  MIN_PASSAGE_CHARS,
} from "@/lib/editorial/stock-prose";

const long = (seed: string) => `${seed} ${"reč ".repeat(60)}`.trim();

describe("splitPassages", () => {
  it("numbers paragraphs the way CreateFinding does: 1-indexed over every non-empty block", () => {
    const chapter = ["# Glava", long("Prvi"), "Kratko.", long("Treći")].join("\n\n");
    const passages = splitPassages(chapter);
    expect(passages.map((p) => p.paragraphNumber)).toEqual([2, 4]);
    expect(passages[0].text.startsWith("Prvi")).toBe(true);
  });

  it("skips headings and paragraphs too short to judge", () => {
    const chapter = [`## ${long("Naslov")}`, "a".repeat(MIN_PASSAGE_CHARS - 1)].join("\n\n");
    expect(splitPassages(chapter)).toEqual([]);
  });
});

describe("buildStockProseRequests", () => {
  const passages = Array.from({ length: 14 }, (_, i) => ({
    paragraphNumber: i + 1,
    text: long(`P${i}`),
  }));

  it(`never asks more than ${PASSAGES_PER_REQUEST} questions in one request`, () => {
    const requests = buildStockProseRequests(passages);
    expect(requests.map((r) => r.passages.length)).toEqual([6, 6, 2]);
    for (const r of requests) {
      expect(Object.keys(r.questions)).toHaveLength(r.passages.length);
    }
  });

  it("points each question at its own passage in its own request's state", () => {
    const [, second] = buildStockProseRequests(passages);
    expect(second.state.passages).toEqual(passages.slice(6, 12).map((p) => p.text));
    const q = second.questions.p0;
    expect(q.type).toBe("score");
    expect(q.instructions).toContain("`passages[0]`");
    expect(q.criteria).toBe(STOCK_PROSE_LEVELS);
  });

  it("asks about the page, never about who wrote it", () => {
    const [first] = buildStockProseRequests(passages);
    for (const q of Object.values(first.questions)) {
      expect(q.instructions).not.toMatch(/machine|generated|language model|author/i);
    }
  });

  it("sends nothing when there is nothing to judge", () => {
    expect(buildStockProseRequests([])).toEqual([]);
  });
});

describe("readStockProseAnswers", () => {
  const batch = [
    { paragraphNumber: 3, text: "a" },
    { paragraphNumber: 7, text: "b" },
  ];

  it("normalises the level position to 0-10 and keeps the paragraph it belongs to", () => {
    const judged = readStockProseAnswers(
      {
        p0: { type: "score", score: 4, confidence: 0.6 },
        p1: { type: "score", score: 1, confidence: 0.7 },
      },
      batch
    );
    expect(judged).toEqual([
      { paragraphNumber: 3, text: "a", score: 10, confidence: 0.6 },
      { paragraphNumber: 7, text: "b", score: 2.5, confidence: 0.7 },
    ]);
  });

  it("skips an answer that did not come back or came back as the wrong type", () => {
    expect(readStockProseAnswers({ p1: { type: "noul", noul: 0.9 } }, batch)).toEqual([]);
  });

  it("clamps an out-of-range score instead of trusting it", () => {
    const [j] = readStockProseAnswers({ p0: { type: "score", score: 9, confidence: 1 } }, batch);
    expect(j.score).toBe(10);
  });
});

describe("selectForCheck — the policy, kept apart from the judgements", () => {
  const j = (score: number, confidence: number) => ({ paragraphNumber: 1, text: "x", score, confidence });

  it("marks the confident stock paragraphs from the held-out chapters", () => {
    const stock = [j(8.7, 0.55), j(6.8, 0.51), j(5.8, 0.55)];
    expect(selectForCheck(stock)).toEqual(stock);
  });

  it("leaves a high score alone when the judge itself is unsure, where the writer's particular prose landed", () => {
    // Measured on chapter 2: 6.9 at 0.22 and 7.2 at 0.06 were the owner's own.
    expect(selectForCheck([j(6.9, 0.22), j(7.2, 0.06)])).toEqual([]);
  });

  it("leaves a confident low score alone", () => {
    expect(selectForCheck([j(4.9, 0.66)])).toEqual([]);
  });
});
