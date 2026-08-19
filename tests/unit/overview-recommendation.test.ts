// tests/unit/overview-recommendation.test.ts
//
// D-173 — the book-overview page held a FOURTH recommendation accounting:
// server-rendered, gated on `!hasFingerprint` alone, never consulting
// `setupComplete`. A writer who finished the wizard having skipped Style was
// still met with "Recommended: Capture Style [Start]" on the overview, while the
// sidebar and the ProactiveGuide (both routed through `nextSetupWorkflow()`)
// had already moved on to the chapter pipeline.
//
// The ladder is extracted here so it is testable at all, and so the setup half
// of it comes from the SAME shared module every other surface uses.
import { describe, it, expect } from "vitest";
import {
  nextOverviewRecommendation,
  type OverviewRecommendationInput,
  type RecommendationChapter,
} from "@/lib/onboarding/overview-recommendation";

const SETUP_WORKFLOW_IDS = [
  "capture-style",
  "create-story-bible",
  "build-architecture",
] as const;

/** Book with one chapter that has not been discussed yet (the 45a state). */
const ONE_UNDISCUSSED: RecommendationChapter[] = [
  { chapterNumber: 1, status: "undiscussed" },
];

function input(
  over: Partial<OverviewRecommendationInput> = {}
): OverviewRecommendationInput {
  return {
    setupComplete: false,
    hasFingerprint: false,
    hasStoryBible: false,
    hasArchitecture: false,
    chapters: ONE_UNDISCUSSED,
    pendingFindings: 0,
    ...over,
  };
}

describe("overview recommendation — setup phase (D-173)", () => {
  it("recommends Capture Style while setup is unfinished (pre-fix parity)", () => {
    const rec = nextOverviewRecommendation(input());
    expect(rec.workflowId).toBe("capture-style");
    expect(rec.reason).toContain("style");
  });

  it("walks the setup ladder in artifact order while setup is unfinished", () => {
    expect(
      nextOverviewRecommendation(input({ hasFingerprint: true })).workflowId
    ).toBe("create-story-bible");
    expect(
      nextOverviewRecommendation(
        input({ hasFingerprint: true, hasStoryBible: true })
      ).workflowId
    ).toBe("build-architecture");
  });

  it("stops soliciting the SKIPPED setup step once the wizard is finished", () => {
    // The exact 45a state: setupComplete, 2/5 steps resolved, style skipped.
    const rec = nextOverviewRecommendation(
      input({ setupComplete: true })
    );
    expect(rec.workflowId).not.toBe("capture-style");
    expect(rec.workflowId).toBe("discuss-chapter");
    expect(rec.reason).toContain("Ch. 1");
  });

  it("never recommends a setup workflow after setupComplete, for any artifact mix", () => {
    for (const hasFingerprint of [false, true]) {
      for (const hasStoryBible of [false, true]) {
        for (const hasArchitecture of [false, true]) {
          const rec = nextOverviewRecommendation(
            input({
              setupComplete: true,
              hasFingerprint,
              hasStoryBible,
              hasArchitecture,
            })
          );
          expect(SETUP_WORKFLOW_IDS).not.toContain(rec.workflowId);
        }
      }
    }
  });
});

describe("overview recommendation — chapter pipeline", () => {
  const settled = {
    hasFingerprint: true,
    hasStoryBible: true,
    hasArchitecture: true,
  };

  it("prefers a drafted chapter (dev-edit) over every later stage", () => {
    const rec = nextOverviewRecommendation(
      input({
        ...settled,
        chapters: [
          { chapterNumber: 3, status: "line_edited" },
          { chapterNumber: 2, status: "dev_edited" },
          { chapterNumber: 1, status: "drafted" },
        ],
      })
    );
    expect(rec.workflowId).toBe("dev-edit");
    expect(rec.reason).toContain("Ch. 1");
  });

  it("recommends line-edit, then beta-read, then the undrafted chapter", () => {
    expect(
      nextOverviewRecommendation(
        input({ ...settled, chapters: [{ chapterNumber: 2, status: "dev_edited" }] })
      ).workflowId
    ).toBe("line-edit");
    expect(
      nextOverviewRecommendation(
        input({ ...settled, chapters: [{ chapterNumber: 2, status: "line_edited" }] })
      ).workflowId
    ).toBe("beta-read");
    expect(
      nextOverviewRecommendation(
        input({ ...settled, chapters: [{ chapterNumber: 4, status: "planned" }] })
      ).workflowId
    ).toBe("write-chapter");
    expect(
      nextOverviewRecommendation(
        input({ ...settled, chapters: [{ chapterNumber: 4, status: "discussed" }] })
      ).workflowId
    ).toBe("plan-chapter");
  });

  it("recommends reviewing pending findings when the pipeline is clear", () => {
    const rec = nextOverviewRecommendation(
      input({
        ...settled,
        chapters: [{ chapterNumber: 1, status: "beta_passed" }],
        pendingFindings: 4,
      })
    );
    expect(rec.workflowId).toBe("discuss-edits");
    expect(rec.reason).toContain("4");
  });

  it("recommends the publishing check only when chapters really are complete", () => {
    const rec = nextOverviewRecommendation(
      input({ ...settled, chapters: [{ chapterNumber: 1, status: "beta_passed" }] })
    );
    expect(rec.workflowId).toBe("publishing-check");
  });

  it("does not claim 'all chapters complete' for a book with no chapters", () => {
    // Reachable now that setupComplete falls through to the pipeline: a
    // skip-everything walk on a chapterless book must not be told its
    // manuscript is finished.
    const rec = nextOverviewRecommendation(
      input({ setupComplete: true, chapters: [] })
    );
    expect(rec.workflowId).not.toBe("publishing-check");
    expect(rec.workflowId).toBe("discuss-chapter");
    expect(rec.reason.toLowerCase()).not.toContain("complete");
  });

  it("is pure — the caller's chapter array is never reordered or mutated", () => {
    const chapters: RecommendationChapter[] = [
      { chapterNumber: 3, status: "drafted" },
      { chapterNumber: 1, status: "undiscussed" },
    ];
    const snapshot = JSON.parse(JSON.stringify(chapters));
    nextOverviewRecommendation(input({ ...settled, chapters }));
    expect(chapters).toEqual(snapshot);
  });

  it("always returns a workflow the writer can start", () => {
    const rec = nextOverviewRecommendation(input({ setupComplete: true, chapters: [] }));
    expect(rec.workflowId.length).toBeGreaterThan(0);
    expect(rec.reason.length).toBeGreaterThan(0);
  });
});
