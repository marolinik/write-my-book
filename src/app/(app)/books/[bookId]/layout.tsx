"use client";

import { use, useState } from "react";
import { JourneySelectorDialog } from "@/components/journey/journey-selector-dialog";
import { useBookState } from "@/hooks/use-book-state";
import { getRecommendedJourney } from "@/lib/agents/journeys";

/**
 * Book layout — Issue 2: Removed the persistent JourneyBanner that occupied
 * space at the top of every book page. Journey guidance now lives exclusively
 * in the sidebar checklist + a one-time inline prompt on the book overview.
 */
export default function BookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const bookState = useBookState(bookId);

  const recommendedJourneyId = bookState.isLoading
    ? "new-novel"
    : (getRecommendedJourney({
        hasChapters: bookState.hasChapters,
        hasFingerprint: bookState.hasFingerprint,
        hasStoryBible: bookState.hasStoryBible,
        hasArchitecture: bookState.hasArchitecture,
        hasImportedManuscript: bookState.hasImportedManuscript,
        chapterCount: bookState.chapterCount,
        chapterStatuses: bookState.chapterStatuses,
      })?.journeyId ?? "new-novel");

  return (
    <>
      {children}
      <JourneySelectorDialog
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        bookId={bookId}
        currentJourneyId={bookState.activeJourneyId}
        recommendedJourneyId={recommendedJourneyId}
      />
    </>
  );
}
