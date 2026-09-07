/**
 * Pure derivation for the Book Development hub stages. Kept free of React/DOM so
 * the pipeline logic (idea → synopsis → structure → research → plan → draft) can
 * be unit-tested without rendering the page.
 */

export type StageStatus = "done" | "partial" | "none";
export type DevelopmentStageKey =
  | "idea"
  | "synopsis"
  | "structure"
  | "research"
  | "plan"
  | "draft";

export interface DevelopmentStageInput {
  hasConcept: boolean;
  hasSynopsis: boolean;
  hasArchitecture: boolean;
  researchDocCount: number;
  chapterCount: number;
  draftedCount: number;
}

export interface DevelopmentStageState {
  key: DevelopmentStageKey;
  status: StageStatus;
}

/**
 * Classify the six pre-draft pipeline stages from the book's document/chapter
 * state. `research` is done at 2+ research docs (partial if any); `plan` is done
 * once at least one chapter is drafted; `draft` is done when every chapter is
 * drafted. These mirror the hub page's rendering.
 */
export function deriveDevelopmentStages(
  input: DevelopmentStageInput
): Array<{ key: DevelopmentStageKey; status: StageStatus }> {
  const planStatus: StageStatus =
    input.chapterCount > 0 && input.draftedCount > 0
      ? "done"
      : input.chapterCount > 0
        ? "partial"
        : "none";

  const draftStatus: StageStatus =
    input.chapterCount > 0 && input.draftedCount === input.chapterCount
      ? "done"
      : input.draftedCount > 0
        ? "partial"
        : "none";

  return [
    { key: "idea", status: input.hasConcept ? "done" : ("none" as StageStatus) },
    { key: "synopsis", status: input.hasSynopsis ? "done" : ("none" as StageStatus) },
    {
      key: "structure",
      status: input.hasArchitecture ? "done" : ("none" as StageStatus),
    },
    {
      key: "research",
      status:
        input.researchDocCount >= 2
          ? "done"
          : input.researchDocCount > 0
            ? "partial"
            : "none",
    },
    { key: "plan", status: planStatus },
    { key: "draft", status: draftStatus },
  ];
}