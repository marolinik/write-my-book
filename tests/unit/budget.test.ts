import { describe, it, expect } from "vitest";
import {
  normalizeSessionCostLimit,
  isOverBudget,
  isBudgetWarning,
  resolveEndReason,
} from "@/lib/agents/budget";

describe("normalizeSessionCostLimit", () => {
  it("passes through a finite positive limit", () => {
    expect(normalizeSessionCostLimit(10)).toBe(10);
    expect(normalizeSessionCostLimit(0.5)).toBe(0.5);
  });

  it("returns undefined for null — the exact BullMQ bug (Infinity → JSON null)", () => {
    // A background job's Infinity budget becomes null after JSON round-trip;
    // it MUST fall back to the caller default, not be read as a real limit and
    // not let the session run unbounded.
    expect(normalizeSessionCostLimit(null)).toBeUndefined();
  });

  it("returns undefined for non-finite numbers", () => {
    expect(normalizeSessionCostLimit(Infinity)).toBeUndefined();
    expect(normalizeSessionCostLimit(-Infinity)).toBeUndefined();
    expect(normalizeSessionCostLimit(NaN)).toBeUndefined();
  });

  it("returns undefined for undefined and non-number types", () => {
    expect(normalizeSessionCostLimit(undefined)).toBeUndefined();
    expect(normalizeSessionCostLimit("10")).toBeUndefined();
    expect(normalizeSessionCostLimit({})).toBeUndefined();
  });

  it("characterization: finite 0 / negatives pass through (matches prior worker logic)", () => {
    // Documents current semantics: only non-finite / non-number inputs fall
    // back. If this ever changes, it is a deliberate behavior change.
    expect(normalizeSessionCostLimit(0)).toBe(0);
    expect(normalizeSessionCostLimit(-5)).toBe(-5);
  });
});

describe("isOverBudget", () => {
  it("is true only when cost strictly exceeds a finite budget", () => {
    expect(isOverBudget(10.01, 10)).toBe(true);
    expect(isOverBudget(10, 10)).toBe(false); // exactly at budget is NOT over
    expect(isOverBudget(9.99, 10)).toBe(false);
  });

  it("treats a non-finite budget as unlimited (never over)", () => {
    expect(isOverBudget(1e9, Infinity)).toBe(false);
    expect(isOverBudget(1e9, NaN)).toBe(false);
  });
});

describe("isBudgetWarning", () => {
  it("fires at or above 80% of a finite budget by default", () => {
    expect(isBudgetWarning(8, 10)).toBe(true);
    expect(isBudgetWarning(7.99, 10)).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(isBudgetWarning(5, 10, 0.5)).toBe(true);
    expect(isBudgetWarning(4.99, 10, 0.5)).toBe(false);
  });

  it("never warns for a non-finite budget", () => {
    expect(isBudgetWarning(1e9, Infinity)).toBe(false);
  });
});

describe("resolveEndReason", () => {
  it("prefers 'budget' over 'timeout' when both are set", () => {
    expect(resolveEndReason(true, false)).toBe("budget");
    expect(resolveEndReason(true, true)).toBe("budget");
  });

  it("returns 'timeout' when only over time", () => {
    expect(resolveEndReason(false, true)).toBe("timeout");
  });

  it("returns 'natural' when neither limit was crossed", () => {
    expect(resolveEndReason(false, false)).toBe("natural");
  });
});
