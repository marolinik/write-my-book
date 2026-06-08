"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBook } from "./use-books";
import {
  detectActiveJourney,
  getJourneyProgress,
  getDetailedJourneyProgress,
  getStepLabel,
  type StepState,
  type SnapshotEntry,
} from "@/lib/agents/journeys";

export interface SetupProgress {
  basicsComplete: boolean;    // book.name && book.genre
  importComplete: boolean;    // hasChapters || setupImportSkipped
  styleComplete: boolean;     // hasFingerprint
  bibleComplete: boolean;     // hasStoryBible
  archComplete: boolean;      // hasArchitecture
  reviewComplete: boolean;    // setupComplete
}

/** Returns 0-based step index of first incomplete step (0..5). Returns 6 if all done. */
export function getFirstIncompleteStep(progress: SetupProgress): number {
  if (!progress.basicsComplete) return 0;
  if (!progress.importComplete) return 1;
  if (!progress.styleComplete) return 2;
  if (!progress.bibleComplete) return 3;
  if (!progress.archComplete) return 4;
  if (!progress.reviewComplete) return 5;
  return 5; // All done — show review step
}

/** Count of completed setup steps out of 6. */
export function getCompletedStepCount(progress: SetupProgress): number {
  let count = 0;
  if (progress.basicsComplete) count++;
  if (progress.importComplete) count++;
  if (progress.styleComplete) count++;
  if (progress.bibleComplete) count++;
  if (progress.archComplete) count++;
  if (progress.reviewComplete) count++;
  return count;
}

interface BookStateResult {
  isLoading: boolean;
  bookName: string;
  language: string;
  hasChapters: boolean;
  chapterCount: number;
  hasStoryBible: boolean;
  hasArchitecture: boolean;
  hasFingerprint: boolean;
  hasStyleProfile: boolean;
  hasAnalysisReport: boolean;
  hasContinuityReport: boolean;
  hasMarketReport: boolean;
  hasImportedManuscript: boolean;
  chapterStatuses: Record<string, number>;
  pendingFindingsCount: number;
  nextRecommendedWorkflow: string | null;
  secondaryWorkflows: Array<{ id: string; reason: string }>;
  setupWorkflows: string[];
  activeJourneyId: string | null;
  journeyProgress: { completed: number; total: number } | null;
  /** Per-step journey completion state — null if no journey selected. */
  journeySteps: StepState[] | null;
  /** Index of current (first incomplete non-optional) step, or -1 if all complete. */
  currentStepIndex: number;
  /** Workflow ID of the next step to complete, or null if all complete / no journey. */
  nextStepWorkflowId: string | null;
  /** Human-readable label for the next step, or null. */
  nextStepLabel: string | null;
  /** True when all non-optional journey steps are complete. */
  journeyComplete: boolean;
  /** All existing document types for workflow prerequisite checking. */
  existingDocTypes: string[];
  /** Setup wizard progress. */
  setupProgress: SetupProgress;
}

/**
 * Derives book state and recommends next workflow.
 * Used by the ProactiveGuide to show intelligent suggestions.
 */
export function useBookState(bookId: string): BookStateResult {
  const { data: book, isLoading: bookLoading } = useBook(bookId);

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: !!bookId,
  });

  const { data: styleData, isLoading: styleLoading } = useQuery({
    queryKey: ["style-profile", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/style`);
      if (!res.ok) throw new Error("Failed to load style");
      return res.json();
    },
    enabled: !!bookId,
  });

  const { data: editorialData, isLoading: editorialLoading } = useQuery({
    queryKey: ["editorial", bookId, "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/editorial/summary`);
      if (!res.ok) throw new Error("Failed to load editorial summary");
      return res.json();
    },
    enabled: !!bookId,
  });

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["book-settings", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/settings`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!bookId,
  });

  const isLoading = bookLoading || docsLoading || styleLoading || editorialLoading || settingsLoading;

  const result = useMemo((): Omit<BookStateResult, "isLoading"> => {
    const docs = Array.isArray(documents)
      ? documents
      : (documents?.documents ?? []);

    const docTypes = new Set<string>(
      docs.map((d: { type: string }) => d.type)
    );

    const hasChapters = (book?.chapters?.length ?? 0) > 0;
    const hasStoryBible = docTypes.has("STORY_BIBLE");
    const hasArchitecture = docTypes.has("ARCHITECTURE");
    const hasFingerprint = docTypes.has("FINGERPRINT");
    const hasAnalysisReport = docTypes.has("ANALYSIS_REPORT");
    const hasContinuityReport = docTypes.has("CONTINUITY_REPORT");
    const hasMarketReport = docTypes.has("MARKET_REPORT");
    const hasImportedManuscript = docTypes.has("MANUSCRIPT_ANALYSIS");

    const profiles = styleData?.profiles ?? [];
    const hasStyleProfile = profiles.length > 0;

    const existingDocTypes = Array.from(docTypes);

    // Tally chapter statuses
    const chapterStatuses: Record<string, number> = {};
    for (const ch of book?.chapters ?? []) {
      chapterStatuses[ch.status] = (chapterStatuses[ch.status] ?? 0) + 1;
    }

    const pendingFindingsCount = editorialData?.pendingCount ?? 0;

    // Determine setup workflows still needed
    const setupWorkflows: string[] = [];
    if (!hasFingerprint) setupWorkflows.push("capture-style");
    if (!hasStoryBible) setupWorkflows.push("create-story-bible");
    if (!hasArchitecture) setupWorkflows.push("build-architecture");

    // Priority-based recommendation
    let nextRecommendedWorkflow: string | null = null;
    const secondaryWorkflows: Array<{ id: string; reason: string }> = [];

    if (!hasChapters) {
      // Greenfield: no chapters yet — guide through setup
      if (!hasFingerprint) {
        nextRecommendedWorkflow = "capture-style";
        if (!hasStoryBible)
          secondaryWorkflows.push({ id: "create-story-bible", reason: "Story Bible not yet created" });
        if (!hasArchitecture)
          secondaryWorkflows.push({ id: "build-architecture", reason: "Architecture not yet created" });
      } else if (!hasStoryBible) {
        nextRecommendedWorkflow = "create-story-bible";
        if (!hasArchitecture)
          secondaryWorkflows.push({ id: "build-architecture", reason: "Architecture not yet created" });
      } else if (!hasArchitecture) {
        nextRecommendedWorkflow = "build-architecture";
      } else {
        // All setup docs exist but no chapters — recommend starting to write
        nextRecommendedWorkflow = "discuss-chapter";
        secondaryWorkflows.push({ id: "write-chapter", reason: "Start writing directly" });
      }
    } else if (!hasFingerprint) {
      nextRecommendedWorkflow = "capture-style";
      if (!hasStoryBible) {
        secondaryWorkflows.push({
          id: "create-story-bible",
          reason: "Story Bible not yet created",
        });
      }
      if (!hasArchitecture) {
        secondaryWorkflows.push({
          id: "build-architecture",
          reason: "Architecture not yet created",
        });
      }
    } else if (!hasStoryBible) {
      nextRecommendedWorkflow = "create-story-bible";
      if (!hasArchitecture) {
        secondaryWorkflows.push({
          id: "build-architecture",
          reason: "Architecture not yet created",
        });
      }
    } else if (!hasArchitecture) {
      nextRecommendedWorkflow = "build-architecture";
    } else {
      // All setup done — look at chapter pipeline
      const chapters = book?.chapters ?? [];

      // Find first chapter that needs work
      const undrafted = chapters.find(
        (ch) =>
          ch.status === "undiscussed" ||
          ch.status === "discussed" ||
          ch.status === "planned"
      );
      const needsDevEdit = chapters.find((ch) => ch.status === "drafted");
      const needsLineEdit = chapters.find((ch) => ch.status === "dev_edited");
      const needsBetaRead = chapters.find((ch) => ch.status === "line_edited");

      if (needsDevEdit) {
        nextRecommendedWorkflow = "dev-edit";
        secondaryWorkflows.push({
          id: "discuss-edits",
          reason: `Ch. ${needsDevEdit.chapterNumber} ready for structural edit`,
        });
      } else if (needsLineEdit) {
        nextRecommendedWorkflow = "line-edit";
      } else if (needsBetaRead) {
        nextRecommendedWorkflow = "beta-read";
      } else if (undrafted) {
        if (undrafted.status === "planned") {
          nextRecommendedWorkflow = "write-chapter";
        } else if (undrafted.status === "discussed") {
          nextRecommendedWorkflow = "plan-chapter";
        } else {
          nextRecommendedWorkflow = "discuss-chapter";
        }
      } else if (pendingFindingsCount > 0) {
        nextRecommendedWorkflow = "discuss-edits";
        secondaryWorkflows.push({
          id: "publishing-check",
          reason: "Run pre-publication checks",
        });
      } else {
        // Everything done
        nextRecommendedWorkflow = "publishing-check";
        secondaryWorkflows.push({
          id: "market-analysis",
          reason: "Analyze market positioning",
        });
      }
    }

    // Journey detection — persisted journeyId takes priority, fall back to heuristic
    const activeJourneyId = settingsData?.journeyId
      ?? detectActiveJourney({
        hasChapters,
        hasFingerprint,
        hasStoryBible,
        hasArchitecture,
        hasImportedManuscript,
      });

    // Legacy journey progress (kept for backward compat)
    const completedWorkflows = new Set<string>();
    if (hasFingerprint) completedWorkflows.add("capture-style");
    if (hasStoryBible) completedWorkflows.add("create-story-bible");
    if (hasArchitecture) completedWorkflows.add("build-architecture");
    if (hasAnalysisReport) completedWorkflows.add("analyze");
    if (hasContinuityReport) completedWorkflows.add("check-series-continuity");
    if (hasMarketReport) completedWorkflows.add("market-analysis");
    if (hasImportedManuscript) completedWorkflows.add("read-manuscript");

    const journeyProgress = activeJourneyId
      ? getJourneyProgress(activeJourneyId, completedWorkflows)
      : null;

    // Detailed journey state — per-step completion array
    const chapterCount = book?.chapters?.length ?? 0;
    const stepInput = {
      hasFingerprint,
      hasStoryBible,
      hasArchitecture,
      hasAnalysisReport,
      hasMarketReport,
      hasContinuityReport,
      hasImportedManuscript,
      chapterCount,
      chapterStatuses,
    };

    const snapshotRaw = settingsData?.journeyStepsSnapshot;
    const snapshot: Record<string, SnapshotEntry> | null =
      snapshotRaw ? (() => { try { return JSON.parse(snapshotRaw); } catch { return null; } })() : null;

    const detailed = activeJourneyId
      ? getDetailedJourneyProgress(activeJourneyId, stepInput, snapshot)
      : null;

    const journeySteps = detailed?.steps ?? null;
    const currentStepIndex = detailed?.currentStepIndex ?? -1;
    const nextStep = journeySteps && currentStepIndex >= 0 ? journeySteps[currentStepIndex] : null;
    const nextStepWorkflowId = nextStep?.workflowId ?? null;
    const nextStepLabel = nextStepWorkflowId ? getStepLabel(nextStepWorkflowId) : null;
    const journeyComplete = detailed ? detailed.completedCount === detailed.totalCount : false;

    // Setup wizard progress
    const setupProgress: SetupProgress = {
      basicsComplete: !!(book?.name && book?.genre),
      importComplete: hasChapters || (settingsData?.setupImportSkipped ?? false),
      styleComplete: hasFingerprint,
      bibleComplete: hasStoryBible,
      archComplete: hasArchitecture,
      reviewComplete: settingsData?.setupComplete ?? false,
    };

    return {
      bookName: book?.name ?? "Book",
      language: book?.language ?? "en",
      hasChapters,
      chapterCount,
      hasStoryBible,
      hasArchitecture,
      hasFingerprint,
      hasStyleProfile,
      hasAnalysisReport,
      hasContinuityReport,
      hasMarketReport,
      hasImportedManuscript,
      chapterStatuses,
      pendingFindingsCount,
      nextRecommendedWorkflow,
      secondaryWorkflows,
      setupWorkflows,
      activeJourneyId,
      journeyProgress,
      journeySteps,
      currentStepIndex,
      nextStepWorkflowId,
      nextStepLabel,
      journeyComplete,
      existingDocTypes,
      setupProgress,
    };
  }, [book, documents, styleData, editorialData, settingsData]);

  return { isLoading, ...result };
}
