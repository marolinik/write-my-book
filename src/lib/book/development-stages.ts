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

export interface DevelopmentStageReport {
  /** The six pipeline stages in order, with their derived status. */
  stages: Array<{ key: DevelopmentStageKey; status: StageStatus }>;
  /** First stage in pipeline order that is not fully done, or null when every
   *  stage is done. Used to surface the writer's recommended next step. */
  nextStage: DevelopmentStageKey | null;
}

const ORDER: DevelopmentStageKey[] = [
  "idea",
  "synopsis",
  "structure",
  "research",
  "plan",
  "draft",
];

/**
 * Classify the six pre-draft pipeline stages from the book's document/chapter
 * state. `research` is done at 2+ research docs (partial if any); `plan` is done
 * once at least one chapter is drafted; `draft` is done when every chapter is
 * drafted. These mirror the hub page's rendering. Returns the stages plus the
 * recommended next (first not-done) stage.
 */
export function deriveDevelopmentStages(
  input: DevelopmentStageInput
): DevelopmentStageReport {
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

  const stages: Array<{ key: DevelopmentStageKey; status: StageStatus }> = [
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

  const nextStage = ORDER.find(
    (key) => stages.find((st) => st.key === key)!.status !== "done"
  );

  return { stages, nextStage: nextStage ?? null };
}