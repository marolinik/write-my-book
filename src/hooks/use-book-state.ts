"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBook } from "./use-books";

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
  chapterStatuses: Record<string, number>;
  pendingFindingsCount: number;
  nextRecommendedWorkflow: string | null;
  secondaryWorkflows: Array<{ id: string; reason: string }>;
  setupWorkflows: string[];
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
    queryKey: ["editorial-summary", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/editorial/summary`);
      if (!res.ok) throw new Error("Failed to load editorial summary");
      return res.json();
    },
    enabled: !!bookId,
  });

  const isLoading = bookLoading || docsLoading || styleLoading || editorialLoading;

  const result = useMemo((): Omit<BookStateResult, "isLoading"> => {
    const docs = Array.isArray(documents)
      ? documents
      : (documents?.documents ?? []);

    const docTypes = new Set(
      docs.map((d: { type: string }) => d.type)
    );

    const hasChapters = (book?.chapters?.length ?? 0) > 0;
    const hasStoryBible = docTypes.has("STORY_BIBLE");
    const hasArchitecture = docTypes.has("ARCHITECTURE");
    const hasFingerprint = docTypes.has("FINGERPRINT");
    const hasAnalysisReport = docTypes.has("ANALYSIS_REPORT");
    const hasContinuityReport = docTypes.has("CONTINUITY_REPORT");
    const hasMarketReport = docTypes.has("MARKET_REPORT");

    const profiles = styleData?.profiles ?? [];
    const hasStyleProfile = profiles.length > 0;

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

    return {
      bookName: book?.name ?? "Book",
      language: book?.language ?? "en",
      hasChapters,
      chapterCount: book?.chapters?.length ?? 0,
      hasStoryBible,
      hasArchitecture,
      hasFingerprint,
      hasStyleProfile,
      hasAnalysisReport,
      hasContinuityReport,
      hasMarketReport,
      chapterStatuses,
      pendingFindingsCount,
      nextRecommendedWorkflow,
      secondaryWorkflows,
      setupWorkflows,
    };
  }, [book, documents, styleData, editorialData]);

  return { isLoading, ...result };
}
