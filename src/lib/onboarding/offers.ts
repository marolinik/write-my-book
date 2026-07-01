// src/lib/onboarding/offers.ts
export type OnboardingArtifactType = "FINGERPRINT" | "ARCHITECTURE" | "STORY_BIBLE";

export interface OnboardingOffer {
  workflowId: "capture-style" | "build-architecture" | "create-story-bible";
  threshold: number;
  artifactType: OnboardingArtifactType;
  title: string;
  cta: string;
}

/** Ordered ascending by threshold. Copy is draft (spec §10). */
export const ONBOARDING_OFFERS: readonly OnboardingOffer[] = [
  { workflowId: "capture-style", threshold: 2000, artifactType: "FINGERPRINT",
    title: "I've read enough to understand your voice.", cta: "Build style fingerprint" },
  { workflowId: "build-architecture", threshold: 5000, artifactType: "ARCHITECTURE",
    title: "Your story has real shape now.", cta: "Map the architecture" },
  { workflowId: "create-story-bible", threshold: 10000, artifactType: "STORY_BIBLE",
    title: "There's a world worth tracking here.", cta: "Start the story bible" },
] as const;

export interface OnboardingInput {
  wordCount: number;
  previousWordCount: number | null;
  existingArtifactTypes: ReadonlySet<string>;
  dismissed: ReadonlySet<string>;
  toasted: ReadonlySet<string>;
  setupComplete: boolean;
}

export interface OnboardingResult {
  /** Eligible offers, ascending by threshold — drives the badge. */
  pending: OnboardingOffer[];
  /** Single offer to toast on this update, or null. */
  toast: OnboardingOffer | null;
}

/**
 * Pure trigger decision. An offer is eligible (→ pending/badge) when the wizard
 * is not complete, the cumulative word count has reached its threshold, its
 * artifact does not yet exist, and it has not been dismissed. `toast` is the
 * lowest-threshold eligible offer that has not been toasted before AND was
 * live-crossed this update (previousWordCount < threshold <= wordCount).
 * previousWordCount === null (first eval / mount seed) never toasts, so reloads
 * and cross-session catch-ups surface only via the badge, never a toast.
 */
export function computeOnboardingOffers(input: OnboardingInput): OnboardingResult {
  const { wordCount, previousWordCount, existingArtifactTypes, dismissed, toasted, setupComplete } = input;

  if (setupComplete) return { pending: [], toast: null };

  const pending = ONBOARDING_OFFERS.filter(
    (o) =>
      wordCount >= o.threshold &&
      !existingArtifactTypes.has(o.artifactType) &&
      !dismissed.has(o.workflowId)
  );

  const toast =
    previousWordCount === null
      ? null
      : pending.find(
          (o) =>
            !toasted.has(o.workflowId) &&
            previousWordCount < o.threshold &&
            wordCount >= o.threshold
        ) ?? null;

  return { pending, toast };
}
