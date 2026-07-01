"use client";

import { useOnboardingOffers } from "@/hooks/use-onboarding-offers";

interface OnboardingWatcherProps {
  bookId: string;
  initialBookWordCount: number;
  setupComplete: boolean;
}

/** Null-rendering client mount that drives write-first onboarding offers. */
export function OnboardingWatcher(props: OnboardingWatcherProps) {
  useOnboardingOffers(props);
  return null;
}
