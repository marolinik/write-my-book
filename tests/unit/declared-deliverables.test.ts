/**
 * A-38 / A-39 / A-40 / A-41 — a workflow that promises a document declares it,
 * and a check that cannot be filed is not filed.
 *
 * Four workflows whose whole output is a document declared none, so the D-188
 * contract could not see an empty run: `read-manuscript` (whose ANALYSIS_REPORT
 * the brownfield journey reads to decide whether the manuscript has been read
 * at all), `analyze`, `market-analysis` and `research-world`.
 *
 * The publishing editor had the opposite problem. `publishing-check` is
 * book-level, so the run carries no chapter scope, and CreateFinding rejects a
 * finding with no chapter and no quote from that chapter's prose — which is
 * every manuscript-wide check it was told to file. And its report parser
 * expected an English "Export Summary" table that no prompt ever defined, from
 * an agent with no WriteDocument tool, reached through a `parseAgentOutput`
 * case nothing calls.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getWorkflow, getAllWorkflows } from "@/lib/agents/workflows";
import {
  BASE_INSTRUCTIONS,
  WORKFLOW_INSTRUCTION_OVERRIDES,
  CONDUCTOR_WORKFLOW_INSTRUCTIONS,
} from "@/lib/agents/prompt-assembler";
import { getAgentDefinition } from "@/lib/agents/definitions";

const srcPath = (...p: string[]) => join(__dirname, "..", "..", "src", ...p);
const read = (...p: string[]) => readFileSync(srcPath(...p), "utf-8");

describe("the workflows whose output is a document", () => {
  it.each([
    ["read-manuscript", "ANALYSIS_REPORT"],
    ["analyze", "ANALYSIS_REPORT"],
    ["market-analysis", "MARKET_REPORT"],
    ["research-world", "WORLD_RESEARCH"],
  ])("%s declares %s", (workflowId, documentType) => {
    expect(getWorkflow(workflowId)?.producesDocument).toBe(documentType);
  });

  it("name that document type in the prompt the workflow actually runs", () => {
    const missing: string[] = [];
    for (const workflow of getAllWorkflows()) {
      const declared = workflow.producesDocument;
      if (!declared) continue;
      // The instruction that names it may live in the specialist's prompt, in
      // the workflow override, or — for a workflow the Coach handles itself —
      // in the conductor text.
      const prompt =
        (BASE_INSTRUCTIONS[workflow.primaryAgent] ?? "") +
        (WORKFLOW_INSTRUCTION_OVERRIDES[workflow.id] ?? "") +
        (CONDUCTOR_WORKFLOW_INSTRUCTIONS[workflow.id] ?? "");
      if (!prompt.includes(declared)) missing.push(`${workflow.id} never names ${declared}`);
    }
    expect(missing).toEqual([]);
  });

  it("leave a conversational workflow free to promise nothing", () => {
    // research-topic saves a document only if the writer asks for one.
    expect(getWorkflow("research-topic")?.producesDocument).toBeUndefined();
    expect(getWorkflow("research-topic")?.conversational).toBe(true);
  });

  it("never declare a document the agent cannot write", () => {
    const offenders = getAllWorkflows()
      .filter((w) => w.producesDocument)
      .filter((w) => !getAgentDefinition(w.primaryAgent)?.tools.includes("WriteDocument"))
      .map((w) => `${w.id} -> ${w.primaryAgent}`);
    expect(offenders).toEqual([]);
  });
});

describe("the publishing editor", () => {
  const prompt = BASE_INSTRUCTIONS["publishing-editor"];

  it("is told that a finding needs a real chapter and a real quote", () => {
    expect(prompt).toContain("This run has no chapter scope of its own");
    expect(prompt).toContain("anchorQuote");
  });

  it("is told where a book-level problem goes instead", () => {
    expect(prompt).toContain("cannot be a finding");
    expect(prompt).toContain("closing summary");
  });
});

describe("the unreachable report parser", () => {
  it("is gone, with its dead dispatch case and types", () => {
    expect(existsSync(srcPath("lib", "parsers", "publishing-editor.ts"))).toBe(false);
    const index = read("lib", "parsers", "index.ts");
    expect(index).not.toContain("parsePublishingEditorReport");
    expect(index).not.toContain('case "export"');
    expect(read("lib", "parsers", "types.ts")).not.toContain("PubEditorData");
  });
});
