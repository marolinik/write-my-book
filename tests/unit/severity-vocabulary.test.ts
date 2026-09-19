/**
 * V-4 — one severity vocabulary, checked.
 *
 * CreateFinding's enum is critical / important / suggestion and the schema is
 * strict, so "major" cannot reach the database: across 255 real findings on the
 * owner's book the counts were suggestion 139, important 112, critical 4,
 * major 0. Six consumers filtered on "major" anyway — cascade warnings,
 * blackboard promotion, book health, the Reports tab and both severity pickers
 * — so the product read 4 findings out of 255 and offered the writer filters
 * that match nothing.
 *
 * The tool schema and the UI now share FINDING_SEVERITIES. This test is the
 * thing that was missing: the contract between them, machine-checked.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FINDING_SEVERITIES } from "@/lib/i18n/finding-labels";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the severity vocabulary", () => {
  it("is the CreateFinding enum in the tool schema", () => {
    // The schema used to re-type the three values; it now spreads this list,
    // so the two cannot drift apart at all.
    const tools = src("lib", "agents", "tools.ts");
    expect(tools).toContain("enum: [...FINDING_SEVERITIES]");
    expect(tools).not.toMatch(/enum: \["critical"/);
    expect([...FINDING_SEVERITIES]).toEqual(["critical", "important", "suggestion"]);
  });

  it("has a writer-facing label for every severity in every language", () => {
    const labels = src("lib", "i18n", "finding-labels.ts");
    for (const sev of FINDING_SEVERITIES) {
      const occurrences = labels.split(`"${sev}":`).length - 1;
      expect(occurrences, `${sev} is missing from a language`).toBeGreaterThanOrEqual(7);
    }
  });

  it("is what the consumers filter on — none of them ask for 'major'", () => {
    const consumers = [
      ["lib", "agents", "post-session.ts"],
      ["lib", "agents", "blackboard.ts"],
      ["lib", "agents", "book-health.ts"],
      ["components", "reports", "edits-overview-tab.tsx"],
    ];
    for (const parts of consumers) {
      const body = src(...parts);
      const filters = [...body.matchAll(/severity[^\n]*"major"/g)];
      expect(filters, `${parts.join("/")} still filters on "major"`).toHaveLength(0);
      expect(body).toMatch(/"important"/);
    }
  });
});
