/**
 * 165 findings waiting is not help, it is a wall.
 *
 * The owner's book carries 255 editorial findings, 165 of them pending. The
 * panel produces them honestly and the product shows all of them, sorted by
 * nothing a reader would care about. Severity is the agent's own guess and
 * three quarters of everything is "important".
 *
 * So the writer opens the Lektura tab and has no idea where to start. That is
 * the single thing standing between them and using the product they paid for.
 *
 * A triage pass asks two questions per finding, over the chapter they all
 * belong to, in one request:
 *
 *   impact  — how much would fixing this improve the chapter for a reader?
 *   conflict — does this ask the writer to undo something they already ruled out?
 *
 * The second question was "would this flatten the author's voice" first, and
 * on 13 real findings it answered 0.35-0.62 every time: genuine uncertainty,
 * because nothing in the state let it decide. The product already stores the
 * answerable version, WriterMemory rows in the writer's own words, and nothing
 * acted on them at triage time.
 *
 * Both answers are stored, not applied. Ranking, thresholds and what the panel
 * shows are code and user controls; changing a weight must never re-run
 * inference. The raw judgements stay reusable.
 */

import { describe, it, expect } from "vitest";
import {
  buildTriageRequest,
  readTriageAnswers,
  rankFindings,
  IMPACT_LEVELS,
  MAX_FINDINGS_PER_REQUEST,
  type TriageInput,
} from "@/lib/editorial/finding-triage";

const findings: TriageInput[] = [
  { id: "a", category: "pacing", severity: "important", description: "The middle sags." },
  { id: "b", category: "prose", severity: "suggestion", description: "Two adverbs in one line." },
  { id: "c", category: "continuity", severity: "critical", description: "He is in two places." },
];

describe("the request", () => {
  it("asks both questions for every finding, in one request", () => {
    const { questions } = buildTriageRequest({ chapter: "prose", findings });
    for (const f of findings) {
      expect(questions[`impact_${f.id}`], f.id).toBeDefined();
      expect(questions[`conflict_${f.id}`], f.id).toBeDefined();
    }
    expect(Object.keys(questions)).toHaveLength(findings.length * 2);
  });

  it("puts the chapter and the findings in shared state, not in the questions", () => {
    const { state, questions } = buildTriageRequest({ chapter: "the prose", findings });
    expect(state.chapter).toBe("the prose");
    expect(Array.isArray(state.findings)).toBe(true);
    // Each question points at its finding by path rather than repeating it.
    const impact = JSON.stringify(questions.impact_a);
    expect(impact).toContain("findings[0]");
    expect(impact).not.toContain("The middle sags");
  });

  it("rates impact on levels that name what a reader would notice", () => {
    expect(IMPACT_LEVELS.length).toBeGreaterThanOrEqual(3);
    for (const level of IMPACT_LEVELS) {
      expect(level.length).toBeGreaterThan(25);
    }
  });

  it("asks the rule question as a yes/no, because it is a veto not a degree", () => {
    const { questions } = buildTriageRequest({ chapter: "x", findings });
    expect(questions.conflict_a.type).toBe("noul");
    expect(questions.impact_a.type).toBe("score");
  });

  it("carries few enough findings that position in the request does not decide the answer", () => {
    // Measured on chapter 2's 13 pending findings, same request forwards and
    // reversed: at 20 per request the mean impact moved 0.43-0.52 and the ends
    // of the list moved up to 1.3; at 6 per request it moved 0.27.
    expect(MAX_FINDINGS_PER_REQUEST).toBeLessThanOrEqual(6);
  });

  it("refuses a batch larger than one request should carry", () => {
    const many = Array.from({ length: MAX_FINDINGS_PER_REQUEST + 1 }, (_, i) => ({
      id: `f${i}`,
      category: "prose",
      severity: "suggestion",
      description: "x",
    }));
    expect(() => buildTriageRequest({ chapter: "x", findings: many })).toThrow();
  });

  it("refuses an empty batch rather than spending a request on nothing", () => {
    expect(() => buildTriageRequest({ chapter: "x", findings: [] })).toThrow();
  });
});

describe("reading the answers", () => {
  const answers = {
    impact_a: { type: "score" as const, score: 3, confidence: 0.8, legend: {}, probabilities: {} },
    conflict_a: { type: "noul" as const, noul: 0.1 },
    impact_b: { type: "score" as const, score: 0.5, confidence: 0.4, legend: {}, probabilities: {} },
    conflict_b: { type: "noul" as const, noul: 0.9 },
  };

  it("pairs each finding with its two answers", () => {
    const read = readTriageAnswers(answers, findings.slice(0, 2));
    expect(read).toHaveLength(2);
    expect(read[0].findingId).toBe("a");
    expect(read[0].ruleConflict).toBe(0.1);
  });

  it("normalises impact onto 0-10, whatever the level count is", () => {
    const read = readTriageAnswers(answers, findings.slice(0, 2));
    const top = IMPACT_LEVELS.length - 1;
    expect(read[0].impact).toBeCloseTo((3 / top) * 10, 5);
    for (const r of read) {
      expect(r.impact).toBeGreaterThanOrEqual(0);
      expect(r.impact).toBeLessThanOrEqual(10);
    }
  });

  it("skips a finding whose answers did not come back, rather than inventing them", () => {
    const read = readTriageAnswers(answers, findings);
    expect(read.map((r) => r.findingId)).toEqual(["a", "b"]);
  });
});

describe("the ranking", () => {
  const judged = [
    { findingId: "high", impact: 9, ruleConflict: 0.05, impactConfidence: 0.9 },
    { findingId: "low", impact: 2, ruleConflict: 0.05, impactConfidence: 0.9 },
    { findingId: "flattening", impact: 9, ruleConflict: 0.95, impactConfidence: 0.9 },
  ];

  it("puts the finding that would help most first", () => {
    expect(rankFindings(judged)[0].findingId).toBe("high");
  });

  it("sinks a note that undoes a decision the writer already made, however right it is", () => {
    const order = rankFindings(judged).map((r) => r.findingId);
    expect(order.indexOf("flattening")).toBeGreaterThan(order.indexOf("high"));
  });

  it("is pure code, so changing the weighting never re-runs inference", () => {
    const once = rankFindings(judged);
    const twice = rankFindings(judged);
    expect(once.map((r) => r.findingId)).toEqual(twice.map((r) => r.findingId));
  });
});
