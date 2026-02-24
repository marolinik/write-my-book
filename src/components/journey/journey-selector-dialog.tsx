"use client";

import { useState } from "react";
import {
  BookPlusIcon,
  FileInputIcon,
  RotateCcwIcon,
  PenToolIcon,
  RocketIcon,
  PaletteIcon,
  LibraryIcon,
  MessageCircleIcon,
  CheckIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllJourneys, type JourneyDefinition } from "@/lib/agents/journeys";
import { useJourneyMutation } from "@/hooks/use-journey";
import { useLanguage } from "@/components/providers/language-provider";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

const ICON_MAP: Record<string, LucideIcon> = {
  BookPlus: BookPlusIcon,
  FileInput: FileInputIcon,
  RotateCcw: RotateCcwIcon,
  PenTool: PenToolIcon,
  Rocket: RocketIcon,
  Palette: PaletteIcon,
  Library: LibraryIcon,
  MessageCircle: MessageCircleIcon,
};

interface JourneySelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  currentJourneyId: string | null;
  recommendedJourneyId: string;
}

export function JourneySelectorDialog({
  open,
  onOpenChange,
  bookId,
  currentJourneyId,
  recommendedJourneyId,
}: JourneySelectorDialogProps) {
  const { t, language } = useLanguage();
  const agentStrings = getAgentStrings(language);
  const journeyMutation = useJourneyMutation(bookId);
  const journeys = getAllJourneys();

  // When switching from an existing journey, show confirmation
  const [pendingJourney, setPendingJourney] = useState<JourneyDefinition | null>(null);

  function handleSelect(journey: JourneyDefinition) {
    if (!currentJourneyId || currentJourneyId === journey.id) {
      // First selection or re-selecting same journey
      journeyMutation.mutate(
        { journeyId: journey.id },
        { onSuccess: () => onOpenChange(false) }
      );
      return;
    }
    // Switching from existing journey -- show confirmation
    setPendingJourney(journey);
  }

  function handleConfirmSwitch() {
    if (!pendingJourney) return;
    journeyMutation.mutate(
      { journeyId: pendingJourney.id },
      {
        onSuccess: () => {
          setPendingJourney(null);
          onOpenChange(false);
        },
      }
    );
  }

  function handleCancel() {
    setPendingJourney(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setPendingJourney(null);
    onOpenChange(nextOpen);
  }

  // Confirmation view
  if (pendingJourney) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.journey.switchConfirmTitle}</DialogTitle>
            <DialogDescription>{t.journey.switchConfirmDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {t.journey.cancel}
            </Button>
            <Button
              onClick={handleConfirmSwitch}
              disabled={journeyMutation.isPending}
            >
              {t.journey.switchConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Selection grid view
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.journey.chooseJourney}</DialogTitle>
          <DialogDescription>{t.journey.chooseJourneyDesc}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
          {journeys.map((journey) => {
            const Icon = ICON_MAP[journey.icon] ?? BookPlusIcon;
            const isCurrent = journey.id === currentJourneyId;
            const isRecommended = journey.id === recommendedJourneyId;
            const requiredStepCount = journey.steps.filter(
              (s) => !s.optional
            ).length;

            return (
              <button
                key={journey.id}
                type="button"
                onClick={() => handleSelect(journey)}
                disabled={journeyMutation.isPending}
                className={`border rounded-lg p-4 cursor-pointer text-left transition-colors hover:border-primary ${
                  isCurrent ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="size-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{agentStrings.journeyLabels[journey.id] ?? journey.label}</span>
                      {isCurrent && (
                        <CheckIcon className="size-3.5 text-primary shrink-0" />
                      )}
                      {isRecommended && !isCurrent && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {t.journey.recommended}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {agentStrings.journeyDescriptions[journey.id] ?? journey.description}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60 mt-1.5 inline-block">
                      {requiredStepCount} {t.journey.steps.toLowerCase()}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
