import { describe, it, expect } from "vitest";
import { shouldRunBatchChild } from "@/lib/agents/batch-budget";

/**
 * THE new batch money-path invariant (BATCH-SPEC §4.5):
 *
 *   No NEW batch child starts once `spent >= cap` (or `halted`).
 *
 * This asserts the GATE, not zero-overshoot. Because `batch:{id}:spent`
 * increments on child COMPLETION and worker concurrency is 2, up to
 * `(concurrency - 1)` in-flight children can finish and overshoot before the
 * guard next trips. Worst-case total spend is bounded by
 *   cap + (concurrency - 1) * maxPerSessionCap
 * — NOT "spend never exceeds cap". The test deliberately does NOT assert
 * zero-overshoot; it asserts that no new child is dispatched after the cap.
 */
describe("shouldRunBatchChild", () => {
  it("never starts a new child when halted (breaker takes precedence over cap)", () => {
    expect(shouldRunBatchChild(0, 10, true)).toBe(false);
    // halted wins even when spend is well under an otherwise-permissive cap
    expect(shouldRunBatchChild(1, 10, true)).toBe(false);
    // halted wins even when the cap is unlimited
    expect(shouldRunBatchChild(0, Infinity, true)).toBe(false);
  });

  it("does NOT start a new child once spend has reached or exceeded the cap", () => {
    expect(shouldRunBatchChild(10, 10, false)).toBe(false); // exactly at cap → gate closed
    expect(shouldRunBatchChild(10.01, 10, false)).toBe(false); // over cap → gate closed
    expect(shouldRunBatchChild(1e9, 10, false)).toBe(false); // far over (overshoot) → gate closed
  });

  it("starts a new child while spend is strictly under a finite cap", () => {
    expect(shouldRunBatchChild(0, 10, false)).toBe(true);
    expect(shouldRunBatchChild(9.99, 10, false)).toBe(true);
  });

  it("treats a non-finite cap (Infinity) as unlimited — always allowed", () => {
    expect(shouldRunBatchChild(0, Infinity, false)).toBe(true);
    expect(shouldRunBatchChild(1e9, Infinity, false)).toBe(true);
  });
});
