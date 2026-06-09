"use client";

import { useState, useCallback, useEffect } from "react";
import { useBookState } from "@/hooks/use-book-state";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage } from "@/components/providers/language-provider";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Play, PartyPopper, Map, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Banner copy — encouraging coach-tone copy per workflow step
// ---------------------------------------------------------------------------

const BANNER_COPY: Record<string, Record<string, string>> = {
  en: {
    "capture-style": "Let\'s capture your unique writing voice. This helps all AI agents write like you.",
    "create-story-bible": "Time to build your story bible — characters, world, and themes all in one place.",
    "build-architecture": "Let\'s design your story structure. This creates the blueprint for your chapters.",
    "new-novel": "Let\'s get started on your novel. We\'ll set up the creative foundation together.",
    "read-manuscript": "Import your existing manuscript so we can analyze its structure.",
    "discuss-chapter": "Ready to brainstorm? Let\'s discuss your next chapter with your writing coach.",
    "plan-chapter": "Your chapters are ready for planning. Let\'s create scene-by-scene blueprints.",
    "write-chapter": "Time to write! Your chapters have plans and are ready to come to life.",
    "dev-edit": "Chapters are drafted. Let\'s run a developmental edit to strengthen the structure.",
    "line-edit": "Great structure! Now let\'s polish the prose with a line edit.",
    "beta-read": "Chapters are polished. Let\'s get feedback from simulated readers.",
    "revise": "Feedback is in. Let\'s revise your chapters based on the editorial findings.",
    "discuss-edits": "Let\'s discuss the editorial findings and decide on next steps.",
    "analyze": "Let\'s analyze your manuscript — readability, pacing, and statistics.",
    "market-analysis": "Let\'s see how your book positions in the market.",
    "publishing-check": "Almost there! Let\'s run the final pre-publication checks.",
    "refresh-style": "Time to refresh your style profile with your latest writing.",
    "evolve-style": "Let\'s evolve your style based on what you\'ve learned.",
    "coach": "Open-ended conversation with your writing coach.",
  },
  sr: {
    "capture-style": "Hajde da uhvatimo vaš jedinstveni autorski glas.",
    "create-story-bible": "Vreme je da napravite bibliju priče.",
    "build-architecture": "Hajde da dizajniramo strukturu priče.",
    "new-novel": "Hajde da počnemo vaš roman.",
    "read-manuscript": "Uvezite vaš postojeći rukopis.",
    "dev-edit": "Poglavlja su napisana. Pokrenimo razvojnu redakciju.",
    "line-edit": "Sada hajde da doradimo prozu.",
    "beta-read": "Hajde da dobijemo povratne informacije od čitalaca.",
  },
};

// ---------------------------------------------------------------------------
// JourneyBanner — Issue 2: Now a dismissable inline card, not a persistent banner
// Used optionally on the book overview page only
// ---------------------------------------------------------------------------

interface JourneyBannerProps {
  bookId: string;
  onChooseJourney?: () => void;
}

export function JourneyBanner({ bookId, onChooseJourney }: JourneyBannerProps) {
  const bookState = useBookState(bookId);
  const { language } = useLanguage();
  const agentStrings = getAgentStrings(language);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const [dismissed, setDismissed] = useState(false);

  // Check if user has already dismissed this for this book
  useEffect(() => {
    try {
      const key = `wmb-journey-dismissed-${bookId}`;
      if (localStorage.getItem(key) === "true") {
        setDismissed(true);
      }
    } catch {
      // ignore
    }
  }, [bookId]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(`wmb-journey-dismissed-${bookId}`, "true");
    } catch {
      // ignore
    }
  }, [bookId]);

  if (dismissed || bookState.isLoading) return null;
  // If a journey is already selected, don\'t show — sidebar handles it
  if (bookState.activeJourneyId) return null;
  // If setup is complete, don\'t nag
  if (bookState.setupProgress.reviewComplete) return null;

  const nextWorkflowId = bookState.nextStepWorkflowId;
  const bannerText = nextWorkflowId
    ? BANNER_COPY[language]?.[nextWorkflowId] ?? BANNER_COPY.en?.[nextWorkflowId]
    : null;

  // Only show if there\'s a meaningful suggestion
  if (!bannerText && !onChooseJourney) return null;

  return (
    <Card className="mx-6 mt-4 border-primary/20 bg-primary/5">
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <Map className="size-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          {bannerText ? (
            <p className="text-sm text-foreground">{bannerText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a writing journey to guide your progress.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {nextWorkflowId && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={() => openWithWorkflow(nextWorkflowId)}
            >
              <Play className="mr-1 size-3" />
              Start
            </Button>
          )}
          {onChooseJourney && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onChooseJourney}
            >
              Choose journey
            </Button>
          )}
          <button
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
