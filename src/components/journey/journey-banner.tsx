"use client";

import { useBookState } from "@/hooks/use-book-state";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Sparkles, Play, PartyPopper, Map } from "lucide-react";

// ---------------------------------------------------------------------------
// Banner copy — encouraging coach-tone copy per workflow step
// ---------------------------------------------------------------------------

const BANNER_COPY: Record<string, string> = {
  "capture-style":
    "Let's capture your unique writing voice. This helps all AI agents write like you.",
  "create-story-bible":
    "Time to build your story bible — characters, world, and themes all in one place.",
  "build-architecture":
    "Let's design your story structure. This creates the blueprint for your chapters.",
  "new-novel":
    "Let's get started on your novel. We'll set up the creative foundation together.",
  "read-manuscript":
    "Import your existing manuscript so we can analyze its structure.",
  "discuss-chapter":
    "Ready to brainstorm? Let's discuss your next chapter with your writing coach.",
  "plan-chapter":
    "Your chapters are ready for planning. Let's create scene-by-scene blueprints.",
  "write-chapter":
    "Time to write! Your chapters have plans and are ready to come to life.",
  "dev-edit":
    "Chapters are drafted. Let's run a developmental edit to strengthen the structure.",
  "line-edit":
    "Great structure! Now let's polish the prose with a line edit.",
  "beta-read":
    "Chapters are polished. Let's get feedback from simulated readers.",
  "revise":
    "Feedback is in. Let's revise your chapters based on the editorial findings.",
  "discuss-edits":
    "Let's discuss the editorial findings and decide on next steps.",
  "analyze":
    "Let's analyze your manuscript — readability, pacing, and statistics.",
  "market-analysis":
    "Let's see how your book positions in the market.",
  "publishing-check":
    "Almost there! Let's run the final pre-publication checks.",
  "refresh-style":
    "Time to refresh your style profile with your latest writing.",
  "evolve-style":
    "Let's evolve your style based on what you've learned.",
  "coach":
    "Open-ended conversation with your writing coach.",
};

function getBannerCopy(workflowId: string | null): string {
  if (!workflowId) return "";
  return BANNER_COPY[workflowId] ?? "";
}

// ---------------------------------------------------------------------------
// JourneyBanner
// ---------------------------------------------------------------------------

interface JourneyBannerProps {
  bookId: string;
  onChooseJourney?: () => void;
}

export function JourneyBanner({ bookId, onChooseJourney }: JourneyBannerProps) {
  const state = useBookState(bookId);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const { t } = useLanguage();

  // Loading — render nothing to avoid hydration mismatch
  if (state.isLoading) return null;

  // State 1: No journey selected
  if (!state.activeJourneyId) {
    return (
      <div className="mx-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
        <Map className="size-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t.journey.noBannerYet}</p>
          <p className="text-xs text-muted-foreground">
            {t.journey.noBannerYetDesc}
          </p>
        </div>
        <Button size="sm" onClick={onChooseJourney}>
          {t.journey.chooseJourney}
        </Button>
      </div>
    );
  }

  // State 2: All steps complete
  if (state.journeyComplete) {
    return (
      <div className="mx-4 mt-4 rounded-lg border border-green-500/20 bg-green-50 dark:bg-green-950/20 px-4 py-3 flex items-center gap-3">
        <PartyPopper className="size-5 text-green-600 dark:text-green-400 shrink-0" />
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          {t.journey.celebrationBanner}
        </p>
      </div>
    );
  }

  // State 3: In progress — show next step
  return (
    <div className="mx-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
      <Sparkles className="size-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {t.journey.nextStep} {state.nextStepLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {getBannerCopy(state.nextStepWorkflowId)}
        </p>
      </div>
      <Button
        size="sm"
        className="shrink-0"
        onClick={() =>
          state.nextStepWorkflowId &&
          openWithWorkflow(state.nextStepWorkflowId)
        }
      >
        <Play className="mr-1 size-3.5" />
        {t.journey.startButton}
      </Button>
    </div>
  );
}
