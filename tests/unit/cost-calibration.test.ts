/**
 * D2 — the estimate learns from what this book actually paid.
 *
 * `estimateWorkflowCost` multiplies a hand-written token heuristic by the
 * model's list price. It has never once looked at what a run cost. Measured
 * drift on real batches was 30-38%, and the writer sees the estimate before
 * agreeing to spend money, so a third of the number is a third of their trust.
 *
 * The cheap honest fix is not a better heuristic. It is to stop guessing once
 * there is evidence: this book has a row in `UsageRecord` for every agent run
 * it has ever paid for. After a handful of runs, the book's own spread is a
 * better answer than any table, and the product can say so out loud — "based
 * on your last 7 runs" is a claim the writer can check.
 *
 * Three things this must not do:
 *  - speak too early. Two runs are an anecdote; the heuristic stays.
 *  - report a range narrower than the evidence. A single repeated value is
 *    suspicious, not precise.
 *  - let one runaway run set the ceiling for every future estimate.
 */

import { describe, it, expect } from "vitest";
import {
  calibrateEstimate,
  MIN_CALIBRATION_RUNS,
} from "@/lib/llm/cost-calibration";

const heuristic = { min: 0.1, max: 0.4 };

describe("calibration", () => {
  it("says nothing at all until there is enough evidence", () => {
    const tooFew = Array.from({ length: MIN_CALIBRATION_RUNS - 1 }, () => 0.25);
    expect(calibrateEstimate(tooFew, heuristic)).toBeNull();
    expect(calibrateEstimate([], heuristic)).toBeNull();
  });

  it("answers from the book's own runs once there are enough", () => {
    const runs = [0.5, 0.55, 0.6, 0.62, 0.7];
    const result = calibrateEstimate(runs, heuristic);
    expect(result).not.toBeNull();
    expect(result!.basedOn).toBe(runs.length);
    // The heuristic said 0.10-0.40. The book has never once paid so little.
    expect(result!.min).toBeGreaterThan(heuristic.max);
  });

  it("brackets the middle of the evidence, not its extremes", () => {
    // One cheap outlier and one runaway must not become the whole range.
    const runs = [0.01, 0.5, 0.52, 0.54, 0.56, 0.58, 9.9];
    const result = calibrateEstimate(runs, heuristic)!;
    expect(result.min).toBeGreaterThan(0.01);
    expect(result.max).toBeLessThan(9.9);
  });

  it("keeps a range even when every run cost the same", () => {
    // Five identical numbers are not proof that the sixth is identical.
    const result = calibrateEstimate([0.4, 0.4, 0.4, 0.4, 0.4], heuristic)!;
    expect(result.max).toBeGreaterThan(result.min);
  });

  it("never returns a negative floor", () => {
    const result = calibrateEstimate([0.001, 0.001, 0.001, 0.002, 0.002], heuristic)!;
    expect(result.min).toBeGreaterThanOrEqual(0);
  });

  it("ignores rows that carry no cost at all", () => {
    // A failed run that billed nothing is not evidence that runs are free.
    const withZeros = [0, 0, 0.5, 0.52, 0.54, 0.56, 0.58];
    const clean = [0.5, 0.52, 0.54, 0.56, 0.58];
    expect(calibrateEstimate(withZeros, heuristic)).toEqual(
      calibrateEstimate(clean, heuristic)
    );
  });
});
