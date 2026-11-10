// P1-9: the platform spend cap summed usage_records, and a usage row was
// deleted with its book (onDelete: Cascade). A Free writer on the owner's key
// reset today's cap by deleting the book and starting again. The row now
// outlives the book, and a session on the owner's key is budgeted at no more
// than what is left of the allowance.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clampSessionBudget } from "@/lib/billing/managed-tier";

const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf-8");
const usageRecord = schema.match(/model UsageRecord \{[\s\S]*?\n\}/)?.[0] ?? "";

describe("usage rows outlive the book they were spent on", () => {
  it("bookId is optional", () => {
    expect(usageRecord).toMatch(/\n\s+bookId\s+String\?\s/);
  });

  it("deleting the book keeps the row and clears its bookId", () => {
    expect(usageRecord).toMatch(/book\s+Book\?\s+@relation\(fields: \[bookId\], references: \[id\], onDelete: SetNull\)/);
  });
});

describe("clampSessionBudget", () => {
  it("never budgets a platform session beyond what is left of the allowance", () => {
    expect(clampSessionBudget(3, 0.5)).toBe(0.5);
  });

  it("keeps the usual budget when the allowance is larger", () => {
    expect(clampSessionBudget(3, 100)).toBe(6);
    expect(clampSessionBudget(1, 100)).toBe(5);
  });
});
