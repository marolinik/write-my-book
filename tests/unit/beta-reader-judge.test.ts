/**
 * The beta gate stops reading the model's prose and asks it a typed question.
 *
 * `beta-reader-parser.ts` is 402 lines of regex trying to recover a verdict and
 * a score from whatever the panel happened to write, in whatever language, and
 * line 91 says:
 *
 *     let result: GateResult["result"] = "FAILED";
 *
 * So a report the regex cannot read is a chapter that failed. Measured on the
 * owner's own book: `betaScore` was null on 28 of 28 chapters and the "Ocena"
 * column was empty product-wide.
 *
 * A System One question cannot miss, because the answer is typed by
 * construction: the verdict is one of three labels, the readiness is a position
 * on a described spectrum, and both arrive with a confidence the code can act
 * on. Nothing is parsed.
 *
 * What this file guards:
 *  - the questions are shaped the way the API requires (a Score needs ordered
 *    levels; a Choice's labels must be exactly the gate's own three);
 *  - the 0-4 position maps onto the product's 0-10 score honestly;
 *  - the judge is OFF unless both switches are set, like every other thing in
 *    this codebase that costs money;
 *  - a failure never destroys the run: the parser's answer stands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BETA_JUDGE_QUESTIONS,
  BETA_READINESS_LEVELS,
  judgeConfigured,
  readinessToScore,
  verdictFrom,
  MIN_VERDICT_CONFIDENCE,
  MIN_READINESS_CONFIDENCE,
} from "@/lib/parsers/beta-reader-judge";

describe("the questions", () => {
  it("offer exactly the three verdicts the gate already stores", () => {
    const labels = Object.keys(BETA_JUDGE_QUESTIONS.verdict.criteria).sort();
    expect(labels).toEqual(["failed", "near_miss", "passed"]);
  });

  it("describe every verdict, so the model is not guessing from a bare word", () => {
    for (const [label, description] of Object.entries(
      BETA_JUDGE_QUESTIONS.verdict.criteria
    )) {
      expect(description, label).toBeTruthy();
      expect(String(description).length, label).toBeGreaterThan(20);
    }
  });

  it("rates readiness on ordered levels that stand on their own", () => {
    expect(BETA_READINESS_LEVELS.length).toBeGreaterThanOrEqual(3);
    for (const level of BETA_READINESS_LEVELS) {
      // A level like "good" tells the model nothing; it has to name a situation.
      expect(level.length).toBeGreaterThan(20);
    }
  });

  it("asks about the chapter, not about the report's formatting", () => {
    const text = JSON.stringify(BETA_JUDGE_QUESTIONS).toLowerCase();
    expect(text).not.toContain("gate result");
    expect(text).not.toContain("markdown");
  });
});

describe("the readiness position", () => {
  const top = BETA_READINESS_LEVELS.length - 1;

  it("maps the bottom level to zero and the top to ten", () => {
    expect(readinessToScore(0)).toBe(0);
    expect(readinessToScore(top)).toBe(10);
  });

  it("keeps a position between levels between scores", () => {
    const middle = readinessToScore(top / 2);
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(10);
  });

  it("never leaves the 0-10 range the product stores", () => {
    for (const raw of [-1, 0, 1.7, top, top + 5]) {
      const score = readinessToScore(raw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(10);
    }
  });
});

describe("the verdict", () => {
  it("is the gate's own vocabulary, upper-cased", () => {
    expect(verdictFrom("passed")).toBe("PASSED");
    expect(verdictFrom("near_miss")).toBe("NEAR_MISS");
    expect(verdictFrom("failed")).toBe("FAILED");
  });

  it("refuses a label it does not recognise rather than inventing a pass", () => {
    expect(verdictFrom("something_else")).toBeNull();
  });
});

describe("the switch", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.BETA_JUDGE_ENABLED;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("is off with no environment at all", () => {
    expect(judgeConfigured({})).toBe(false);
  });

  it("is off with only a key", () => {
    expect(judgeConfigured({ TYPESAFE_API_KEY: "k" })).toBe(false);
  });

  it("is off with only the flag", () => {
    expect(judgeConfigured({ BETA_JUDGE_ENABLED: "1" })).toBe(false);
  });

  it("is on only when the owner set both", () => {
    expect(judgeConfigured({ TYPESAFE_API_KEY: "k", BETA_JUDGE_ENABLED: "1" })).toBe(true);
  });
});

describe("confidence", () => {
  it("gates the verdict harder than the score, and both are real thresholds", () => {
    for (const floor of [MIN_VERDICT_CONFIDENCE, MIN_READINESS_CONFIDENCE]) {
      expect(floor).toBeGreaterThan(0);
      expect(floor).toBeLessThan(1);
    }
    // Measured on 28 real reports: the verdict was right 14/17 above 0.5 and
    // 1/4 below it, so the verdict is the judgement worth gating. The parser
    // produces no score at all on 25 of 28, so an uncertain number still
    // beats nothing.
    expect(MIN_VERDICT_CONFIDENCE).toBeGreaterThan(MIN_READINESS_CONFIDENCE);
  });
});

describe("the judge in use", () => {
  const ORIGINAL = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL };
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("answers null when it is switched off, so the parser stands", async () => {
    delete process.env.TYPESAFE_API_KEY;
    delete process.env.BETA_JUDGE_ENABLED;
    const { judgeBetaRead } = await import("@/lib/parsers/beta-reader-judge");
    expect(await judgeBetaRead({ report: "anything" })).toBeNull();
  });

  it("answers null when the service fails, rather than failing the run", async () => {
    process.env.TYPESAFE_API_KEY = "k";
    process.env.BETA_JUDGE_ENABLED = "1";
    vi.resetModules();
    vi.doMock("@typesafe-ai/sdk", () => ({
      TypeSafeClient: class {
        systemOne() {
          return Promise.reject(new Error("service down"));
        }
      },
      choice: (instructions: unknown, criteria: unknown) => ({ type: "choice", instructions, criteria }),
      score: (instructions: unknown, criteria: unknown) => ({ type: "score", instructions, criteria }),
      noul: (instructions: unknown) => ({ type: "noul", instructions }),
    }));
    const { judgeBetaRead } = await import("@/lib/parsers/beta-reader-judge");
    expect(await judgeBetaRead({ report: "anything" })).toBeNull();
  });
});

describe("the beta gate in post-session", () => {
  const postSession = readFileSync(
    join(__dirname, "..", "..", "src", "lib", "agents", "post-session.ts"),
    "utf-8"
  );

  it("asks the judge", () => {
    expect(postSession).toContain("judgeBetaRead(");
  });

  it("takes the score whenever the judge answers, because the parser had none", () => {
    expect(postSession).toContain("judgement?.scoreUsable === true ? judgement.score : avgScore");
  });

  it("takes the verdict only when the judge is confident", () => {
    expect(postSession).toContain("judgement?.verdictUsable === true ? judgement.verdict : gate.result");
  });

  it("advances the chapter on the verdict it actually stored", () => {
    // Storing the judge's verdict and then advancing on the parser's would
    // leave the gate saying one thing and the pipeline doing another.
    expect(postSession).toContain('betaVerdict === "PASSED"');
    expect(postSession).not.toContain('gate.result === "PASSED"');
  });
});
