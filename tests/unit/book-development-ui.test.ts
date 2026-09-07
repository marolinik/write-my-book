import { describe, it, expect } from "vitest";
import {
  deriveDevelopmentStages,
  type DevelopmentStageKey,
} from "@/lib/book/development-stages";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { getAgentDefinition } from "@/lib/agents/definitions";

const UI_CODES = ["en", "sr", "de", "es", "fr", "ru", "zh"] as const;

const byKey = (input: Parameters<typeof deriveDevelopmentStages>[0]) =>
  Object.fromEntries(
    deriveDevelopmentStages(input).stages.map((s) => [s.key, s.status])
  ) as Record<DevelopmentStageKey, "done" | "partial" | "none">;

const nextOf = (input: Parameters<typeof deriveDevelopmentStages>[0]) =>
  deriveDevelopmentStages(input).nextStage;

describe("Book Development hub — stage status derivation", () => {
  it("brand-new book: every stage is not started and next is Idea", () => {
    const m = byKey({
      hasConcept: false,
      hasSynopsis: false,
      hasArchitecture: false,
      researchDocCount: 0,
      chapterCount: 0,
      draftedCount: 0,
    });
    expect(m).toEqual({
      idea: "none",
      synopsis: "none",
      structure: "none",
      research: "none",
      plan: "none",
      draft: "none",
    });
    expect(nextOf({
      hasConcept: false,
      hasSynopsis: false,
      hasArchitecture: false,
      researchDocCount: 0,
      chapterCount: 0,
      draftedCount: 0,
    })).toBe("idea");
  });

  it("concept + synopsis + architecture present: first three done, next is research", () => {
    const input = {
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 0,
      chapterCount: 0,
      draftedCount: 0,
    };
    const m = byKey(input);
    expect(m.idea).toBe("done");
    expect(m.synopsis).toBe("done");
    expect(m.structure).toBe("done");
    expect(m.research).toBe("none");
    expect(m.plan).toBe("none");
    expect(m.draft).toBe("none");
    expect(nextOf(input)).toBe("research");
  });

  it("one research doc is partial; two+ is done", () => {
    const one = byKey({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 1,
      chapterCount: 0,
      draftedCount: 0,
    });
    expect(one.research).toBe("partial");
    expect(one.plan).toBe("none");

    const two = byKey({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 2,
      chapterCount: 0,
      draftedCount: 0,
    });
    expect(two.research).toBe("done");
  });

  it("plan is partial with chapters but no drafted content, done once drafted", () => {
    const planned = byKey({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 0,
      chapterCount: 3,
      draftedCount: 0,
    });
    expect(planned.plan).toBe("partial");
    expect(planned.draft).toBe("none");

    const partiallyDrafted = byKey({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 0,
      chapterCount: 3,
      draftedCount: 1,
    });
    expect(partiallyDrafted.plan).toBe("done");
    expect(partiallyDrafted.draft).toBe("partial");
  });

  it("draft is done only when every chapter carries drafted content; then no next stage", () => {
    const finished = byKey({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 2,
      chapterCount: 4,
      draftedCount: 4,
    });
    expect(finished.research).toBe("done");
    expect(finished.plan).toBe("done");
    expect(finished.draft).toBe("done");
    expect(
      nextOf({
        hasConcept: true,
        hasSynopsis: true,
        hasArchitecture: true,
        researchDocCount: 2,
        chapterCount: 4,
        draftedCount: 4,
      })
    ).toBeNull();
  });

  it("next stage advances through the pipeline in order", () => {
    // Nothing
    expect(
      nextOf({
        hasConcept: false,
        hasSynopsis: false,
        hasArchitecture: false,
        researchDocCount: 0,
        chapterCount: 0,
        draftedCount: 0,
      })
    ).toBe("idea");
    // Concept done -> synopsis
    expect(
      nextOf({
        hasConcept: true,
        hasSynopsis: false,
        hasArchitecture: false,
        researchDocCount: 0,
        chapterCount: 0,
        draftedCount: 0,
      })
    ).toBe("synopsis");
  });
});

describe("Book Development hub — i18n coverage in every UI locale", () => {
  it.each(UI_CODES)("%s supplies all six stage titles/statuses non-empty", (code) => {
    const bd = getUIStrings(code).bookDevelopment;
    for (const key of [
      "title",
      "subtitle",
      "idea",
      "synopsis",
      "structure",
      "research",
      "plan",
      "draft",
      "done",
      "inProgress",
      "notStarted",
      "runWorkflow",
      "viewArtifact",
      "startWriting",
    ] as const) {
      expect(bd[key]).toBeTruthy();
    }
  });

  it.each(UI_CODES)("%s supplies the sidebar 'development' nav label", (code) => {
    expect(getUIStrings(code).nav.development).toBeTruthy();
  });

  it("non-English locale translates the hub title (sr)", () => {
    expect(getUIStrings("sr").bookDevelopment.title).not.toBe(
      getUIStrings("en").bookDevelopment.title
    );
  });
});

describe("Book Development hub — synopsis feedback to review agents", () => {
  it("dev-editor carries the full synopsis into its prompt context", () => {
    const def = getAgentDefinition("dev-editor");
    expect(def).toBeDefined();
    expect(def!.contextProfile.synopsis).toBe("full");
  });

  it("continuity-checker carries the full synopsis into its prompt context", () => {
    const def = getAgentDefinition("continuity-checker");
    expect(def).toBeDefined();
    expect(def!.contextProfile.synopsis).toBe("full");
  });

  it("micro-level line-editor does not (prose-scope, not story-level)", () => {
    const def = getAgentDefinition("line-editor");
    expect(def).toBeDefined();
    expect(def!.contextProfile.synopsis).toBe("none");
  });
});