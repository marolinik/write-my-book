import { describe, it, expect } from "vitest";
import { deriveDevelopmentStages } from "@/lib/book/development-stages";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const UI_CODES = ["en", "sr", "de", "es", "fr", "ru", "zh"] as const;

describe("Book Development hub — stage status derivation", () => {
  it("brand-new book: only the Idea stage is actionable, the rest are not started", () => {
    const stages = deriveDevelopmentStages({
      hasConcept: false,
      hasSynopsis: false,
      hasArchitecture: false,
      researchDocCount: 0,
      chapterCount: 0,
      draftedCount: 0,
    });
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.status]));
    expect(byKey.idea).toBe("none");
    expect(byKey.synopsis).toBe("none");
    expect(byKey.structure).toBe("none");
    expect(byKey.research).toBe("none");
    expect(byKey.plan).toBe("none");
    expect(byKey.draft).toBe("none");
  });

  it("concept + synopsis + architecture present: first three marked done", () => {
    const stages = deriveDevelopmentStages({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 0,
      chapterCount: 0,
      draftedCount: 0,
    });
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.status]));
    expect(byKey.idea).toBe("done");
    expect(byKey.synopsis).toBe("done");
    expect(byKey.structure).toBe("done");
    expect(byKey.research).toBe("none");
    expect(byKey.plan).toBe("none");
    expect(byKey.draft).toBe("none");
  });

  it("one research doc is partial; two+ is done", () => {
    const one = deriveDevelopmentStages({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 1,
      chapterCount: 0,
      draftedCount: 0,
    });
    expect(Object.fromEntries(one.map((s) => [s.key, s.status])).research).toBe(
      "partial"
    );

    const two = deriveDevelopmentStages({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 2,
      chapterCount: 0,
      draftedCount: 0,
    });
    expect(Object.fromEntries(two.map((s) => [s.key, s.status])).research).toBe(
      "done"
    );
  });

  it("plan is partial with chapters but no drafted content, done once drafted", () => {
    const planned = deriveDevelopmentStages({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 0,
      chapterCount: 3,
      draftedCount: 0,
    });
    const plannedMap = Object.fromEntries(planned.map((s) => [s.key, s.status]));
    expect(plannedMap.plan).toBe("partial");
    expect(plannedMap.draft).toBe("none");

    const partiallyDrafted = deriveDevelopmentStages({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 0,
      chapterCount: 3,
      draftedCount: 1,
    });
    const pd = Object.fromEntries(partiallyDrafted.map((s) => [s.key, s.status]));
    expect(pd.plan).toBe("done");
    expect(pd.draft).toBe("partial");
  });

  it("draft is done only when every chapter carries drafted content", () => {
    const finished = deriveDevelopmentStages({
      hasConcept: true,
      hasSynopsis: true,
      hasArchitecture: true,
      researchDocCount: 2,
      chapterCount: 4,
      draftedCount: 4,
    });
    const map = Object.fromEntries(finished.map((s) => [s.key, s.status]));
    expect(map.research).toBe("done");
    expect(map.plan).toBe("done");
    expect(map.draft).toBe("done");
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