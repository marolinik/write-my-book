"use client";

import { use, useState } from "react";
import { JourneyBanner } from "@/components/journey/journey-banner";
import { JourneySelectorDialog } from "@/components/journey/journey-selector-dialog";
import { useBookState } from "@/hooks/use-book-state";
import { getRecommendedJourney } from "@/lib/agents/journeys";

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
      <JourneyBanner
        bookId={bookId}
        onChooseJourney={() => setSelectorOpen(true)}
      />
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
