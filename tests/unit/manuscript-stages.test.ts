import { describe, it, expect } from "vitest";
import {
  deriveManuscriptStages,
  isImportedManuscript,
  MANUSCRIPT_STAGE_ORDER,
  type ManuscriptStageInput,
} from "@/lib/book/manuscript-stages";

/**
 * O11 — a writer who imported a finished book was shown the greenfield path
 * (Idea, Synopsis, Structure, Research, Plan, Draft), which does not apply to
 * him, and never met the "Existing Manuscript" path that does. This derives the
 * importer's board from the same document/session state the greenfield board
 * reads, so the two are decided by data, not by a toggle.
 */

const base: ManuscriptStageInput = {
  hasReadManuscriptRun: false,
  hasFingerprint: false,
  hasStoryBible: false,
  hasArchitecture: false,
  hasAnalysisReport: false,
  structureMovesTotal: 0,
  structureMovesPending: 0,
  chapterCount: 40,
  editedCount: 0,
};

describe("isImportedManuscript", () => {
  it("is true when chapters arrived by import", () => {
    expect(isImportedManuscript({ importedChapterCount: 40, chapterCount: 40, hasConcept: false, hasSynopsis: false })).toBe(true);
  });

  it("is true for a book full of chapters that never had a concept or a synopsis", () => {
    // The trilogy was pasted in chapter by chapter before importedAt existed.
    expect(isImportedManuscript({ importedChapterCount: 0, chapterCount: 31, hasConcept: false, hasSynopsis: false })).toBe(true);
  });

  it("is false for a book being written from an idea", () => {
    expect(isImportedManuscript({ importedChapterCount: 0, chapterCount: 3, hasConcept: true, hasSynopsis: true })).toBe(false);
    expect(isImportedManuscript({ importedChapterCount: 0, chapterCount: 0, hasConcept: false, hasSynopsis: false })).toBe(false);
  });

  it("stays true once imported, even after the derived documents exist", () => {
    expect(isImportedManuscript({ importedChapterCount: 40, chapterCount: 40, hasConcept: true, hasSynopsis: true })).toBe(true);
  });
});

describe("deriveManuscriptStages", () => {
  it("runs read, style, bible, architecture, analyze, restructure, edit in that order", () => {
    const { stages } = deriveManuscriptStages(base);
    expect(stages.map((s) => s.key)).toEqual(MANUSCRIPT_STAGE_ORDER);
    expect(MANUSCRIPT_STAGE_ORDER).toEqual([
      "read",
      "style",
      "bible",
      "architecture",
      "analyze",
      "restructure",
      "edit",
    ]);
  });

  it("points a fresh import at reading the manuscript first", () => {
    const { nextStage, stages } = deriveManuscriptStages(base);
    expect(nextStage).toBe("read");
    expect(stages.every((s) => s.status === "none")).toBe(true);
  });

  it("marks each stage done from its own artifact", () => {
    const { stages, nextStage } = deriveManuscriptStages({
      ...base,
      hasReadManuscriptRun: true,
      hasFingerprint: true,
      hasStoryBible: true,
    });
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.status]));
    expect(byKey.read).toBe("done");
    expect(byKey.style).toBe("done");
    expect(byKey.bible).toBe("done");
    expect(byKey.architecture).toBe("none");
    expect(nextStage).toBe("architecture");
  });

  it("treats restructure as in progress while moves are still waiting on the writer", () => {
    const { stages, nextStage } = deriveManuscriptStages({
      ...base,
      hasReadManuscriptRun: true,
      hasFingerprint: true,
      hasStoryBible: true,
      hasArchitecture: true,
      hasAnalysisReport: true,
      structureMovesTotal: 5,
      structureMovesPending: 2,
    });
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.status]));
    expect(byKey.restructure).toBe("partial");
    expect(nextStage).toBe("restructure");
  });

  it("counts restructure as done once every proposed move has been decided", () => {
    const { stages } = deriveManuscriptStages({
      ...base,
      hasReadManuscriptRun: true,
      hasFingerprint: true,
      hasStoryBible: true,
      hasArchitecture: true,
      hasAnalysisReport: true,
      structureMovesTotal: 5,
      structureMovesPending: 0,
    });
    const byKey = Object.fromEntries(stages.map((s) => [s.key, s.status]));
    expect(byKey.restructure).toBe("done");
  });

  it("tracks editing across the chapters and finishes the path", () => {
    const partial = deriveManuscriptStages({
      ...base,
      hasReadManuscriptRun: true,
      hasFingerprint: true,
      hasStoryBible: true,
      hasArchitecture: true,
      hasAnalysisReport: true,
      structureMovesTotal: 2,
      structureMovesPending: 0,
      editedCount: 12,
    });
    expect(Object.fromEntries(partial.stages.map((s) => [s.key, s.status])).edit).toBe("partial");
    expect(partial.nextStage).toBe("edit");

    const complete = deriveManuscriptStages({
      ...base,
      hasReadManuscriptRun: true,
      hasFingerprint: true,
      hasStoryBible: true,
      hasArchitecture: true,
      hasAnalysisReport: true,
      structureMovesTotal: 2,
      structureMovesPending: 0,
      editedCount: 40,
    });
    expect(Object.fromEntries(complete.stages.map((s) => [s.key, s.status])).edit).toBe("done");
    expect(complete.nextStage).toBeNull();
  });

  it("never reports edit as done for a book with no chapters", () => {
    const { stages } = deriveManuscriptStages({ ...base, chapterCount: 0, editedCount: 0 });
    expect(Object.fromEntries(stages.map((s) => [s.key, s.status])).edit).toBe("none");
  });
});
