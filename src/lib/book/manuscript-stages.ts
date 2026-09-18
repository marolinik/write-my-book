/**
 * O11 — the development board for a book that arrived finished.
 *
 * The greenfield pipeline (idea, synopsis, structure, research, plan, draft) is
 * the wrong map for an importer: he has 40 chapters and no concept, so every
 * card reads "not started" for work he will never do. The "Existing Manuscript"
 * journey already existed in journeys.ts but was only reachable from the agent
 * panel, so the writer never met the path that applies to him.
 *
 * This derives that path from the same document/session state the greenfield
 * board reads, which keeps the choice a property of the data rather than a
 * toggle the writer has to find. Pure — no React, no Prisma.
 */

export type StageStatus = "done" | "partial" | "none";

export type ManuscriptStageKey =
  | "read"
  | "style"
  | "bible"
  | "architecture"
  | "analyze"
  | "restructure"
  | "edit";

export const MANUSCRIPT_STAGE_ORDER: ManuscriptStageKey[] = [
  "read",
  "style",
  "bible",
  "architecture",
  "analyze",
  "restructure",
  "edit",
];

export interface ManuscriptStageInput {
  /** A completed `read-manuscript` session — the 5-pass read produces no document. */
  hasReadManuscriptRun: boolean;
  hasFingerprint: boolean;
  hasStoryBible: boolean;
  hasArchitecture: boolean;
  hasAnalysisReport: boolean;
  /** Structural proposals ever filed for this book, and how many still await a decision. */
  structureMovesTotal: number;
  structureMovesPending: number;
  /** How many were actually carried out and still stand (not undone). */
  structureMovesApplied: number;
  chapterCount: number;
  /** Chapters past dev-edit. */
  editedCount: number;
}

export interface ManuscriptStageReport {
  stages: Array<{ key: ManuscriptStageKey; status: StageStatus }>;
  /** First stage that is not done, or null when the path is complete. */
  nextStage: ManuscriptStageKey | null;
}

export interface ImportedCheckInput {
  /** Chapters carrying an `importedAt` stamp. */
  importedChapterCount: number;
  chapterCount: number;
  hasConcept: boolean;
  hasSynopsis: boolean;
}

/**
 * Is this book an existing manuscript rather than one being written from an idea?
 *
 * The `importedAt` stamp is the direct answer. The second clause catches the
 * books that predate it (and the ones pasted in chapter by chapter): a book
 * carrying a substantial number of chapters while never having had a concept or
 * a synopsis was not written forward inside this app.
 */
export function isImportedManuscript(input: ImportedCheckInput): boolean {
  if (input.importedChapterCount > 0) return true;
  return input.chapterCount >= 3 && !input.hasConcept && !input.hasSynopsis;
}

function statusOf(done: boolean, partial = false): StageStatus {
  if (done) return "done";
  return partial ? "partial" : "none";
}

/**
 * Classify the seven stages of the existing-manuscript path and name the first
 * one that is not finished.
 */
export function deriveManuscriptStages(
  input: ManuscriptStageInput
): ManuscriptStageReport {
  // A proposal the writer has not decided is work in progress, not work done:
  // the point of the pass is the decision, not the report.
  //
  // And an empty decision queue is not an outcome. A book whose every proposal
  // was rejected, undone or failed to run has a manuscript nobody changed, so
  // the pass reads as not started and the board recommends it again — calling
  // that "done" put a green tick on work that never happened (S3-7).
  const restructure: StageStatus =
    input.structureMovesTotal === 0
      ? "none"
      : input.structureMovesPending > 0
        ? "partial"
        : input.structureMovesApplied > 0
          ? "done"
          : "none";

  const edit: StageStatus =
    input.chapterCount === 0 || input.editedCount === 0
      ? "none"
      : input.editedCount >= input.chapterCount
        ? "done"
        : "partial";

  const byKey: Record<ManuscriptStageKey, StageStatus> = {
    read: statusOf(input.hasReadManuscriptRun),
    style: statusOf(input.hasFingerprint),
    bible: statusOf(input.hasStoryBible),
    architecture: statusOf(input.hasArchitecture),
    analyze: statusOf(input.hasAnalysisReport),
    restructure,
    edit,
  };

  const stages = MANUSCRIPT_STAGE_ORDER.map((key) => ({ key, status: byKey[key] }));
  const nextStage = stages.find((s) => s.status !== "done")?.key ?? null;

  return { stages, nextStage };
}
