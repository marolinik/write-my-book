/**
 * C4 / V-5 — the writer who imports a manuscript.
 *
 * Two independent defects met on the same journey. The setup guard 422s any
 * workflow outside the `setup` category until FINGERPRINT, STORY_BIBLE and
 * ARCHITECTURE exist — and `read-manuscript`, which is step 1 of the
 * Existing-Manuscript journey, is `analysis`, while steps 2-4 are what produce
 * those three documents. And the state flag that routes the journey read a
 * DocumentType that does not exist ("MANUSCRIPT_ANALYSIS" occurs once in the
 * repository, on that line), so it was permanently false.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getWorkflow, getAllWorkflows } from "@/lib/agents/workflows";
import { getJourney, isStepComplete, type StepCompletionInput } from "@/lib/agents/journeys";
import { DocumentType } from "@/generated/prisma/enums";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

const state = (over: Partial<StepCompletionInput> = {}): StepCompletionInput => ({
  hasFingerprint: false,
  hasStoryBible: false,
  hasArchitecture: false,
  hasSynopsis: false,
  hasAnalysisReport: false,
  hasMarketReport: false,
  hasContinuityReport: false,
  hasImportedManuscript: false,
  chapterCount: 0,
  chapterStatuses: {},
  ...over,
});

describe("the Existing-Manuscript journey can start at its first step", () => {
  it("its first step is read-manuscript", () => {
    expect(getJourney("existing-manuscript")?.steps[0]?.workflowId).toBe("read-manuscript");
  });

  it("read-manuscript is exempt from the setup guard", () => {
    expect(getWorkflow("read-manuscript")?.allowedBeforeSetup).toBe(true);
  });

  it("the guard honours the exemption rather than the category alone", () => {
    const route = src("app", "api", "books", "[id]", "agent", "route.ts");
    expect(route).toMatch(/workflow\.category !== "setup" && !workflow\.allowedBeforeSetup/);
  });

  it("no other workflow claims the exemption without needing it", () => {
    const exempt = getAllWorkflows().filter((w) => w.allowedBeforeSetup);
    expect(exempt.map((w) => w.id)).toEqual(["read-manuscript"]);
  });
});

describe("the brownfield state flag", () => {
  it("read-manuscript completes on the document it actually writes", () => {
    const step = { workflowId: "read-manuscript" };
    expect(isStepComplete(step, state({ hasAnalysisReport: true }))).toBe(true);
    expect(isStepComplete(step, state({ hasImportedManuscript: true }))).toBe(false);
  });

  it("ANALYSIS_REPORT is a real DocumentType and MANUSCRIPT_ANALYSIS is not", () => {
    expect(Object.values(DocumentType)).toContain("ANALYSIS_REPORT");
    expect(Object.values(DocumentType)).not.toContain("MANUSCRIPT_ANALYSIS");
  });

  it("the hook reads imported chapters, not a document type", () => {
    const hook = src("hooks", "use-book-state.ts");
    expect(hook).not.toMatch(/MANUSCRIPT_ANALYSIS/);
    expect(hook).toMatch(/ch\.importedAt != null/);
  });
});
