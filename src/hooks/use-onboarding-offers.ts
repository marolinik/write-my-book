// src/hooks/use-onboarding-offers.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { computeOnboardingOffers } from "@/lib/onboarding/offers";
import {
  getOnboardingState,
  addDismissed,
  addToasted,
} from "@/lib/onboarding/local-state";

interface UseOnboardingOffersParams {
  bookId: string;
  initialBookWordCount: number;
  setupComplete: boolean;
}

/**
 * Watches cumulative book word count and offers craft workflows at milestones.
 * Mount once per book (via OnboardingWatcher on the chapter editor page).
 */
export function useOnboardingOffers({
  bookId,
  initialBookWordCount,
  setupComplete,
}: UseOnboardingOffersParams): void {
  const qc = useQueryClient();
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const setOnboardingOffers = useAgentUIStore((s) => s.setOnboardingOffers);

  // Live cumulative word count: seeded from the server, then updated by the
  // save mutation via qc.setQueryData(["book-wordcount", bookId], n).
  const { data: bookWordCount = initialBookWordCount } = useQuery<number>({
    queryKey: ["book-wordcount", bookId],
    queryFn: () =>
      qc.getQueryData<number>(["book-wordcount", bookId]) ?? initialBookWordCount,
    initialData: initialBookWordCount,
    staleTime: Infinity,
  });

  // Artifact types already present for this book.
  const { data: artifactTypes } = useQuery<Set<string>>({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) return new Set<string>();
      const docs = (await res.json()) as Array<{ type: string }>;
      return new Set(docs.map((d) => d.type));
    },
    staleTime: 30_000,
  });

  // SSR-safe: load dismissed/toasted after mount (empty on server + first render).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [toasted, setToasted] = useState<Set<string>>(new Set());
  useEffect(() => {
    const state = getOnboardingState(bookId);
    setDismissed(state.dismissed);
    setToasted(state.toasted);
  }, [bookId]);

  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const types = artifactTypes ?? new Set<string>();
    const { pending, toast: toFire } = computeOnboardingOffers({
      wordCount: bookWordCount,
      previousWordCount: prevRef.current,
      existingArtifactTypes: types,
      dismissed,
      toasted,
      setupComplete,
    });

    if (toFire) {
      addToasted(bookId, toFire.workflowId);
      setToasted((s) => new Set(s).add(toFire.workflowId));
      toast(toFire.title, {
        duration: 10_000,
        action: {
          label: toFire.cta,
          onClick: () => openWithWorkflow(toFire.workflowId),
        },
        cancel: {
          label: "Not now",
          onClick: () => {
            addDismissed(bookId, toFire.workflowId);
            setDismissed((s) => new Set(s).add(toFire.workflowId));
          },
        },
      });
    }

    setOnboardingOffers(
      pending.map((o) => ({ workflowId: o.workflowId, cta: o.cta }))
    );

    // Update the crossing baseline for the next evaluation.
    prevRef.current = bookWordCount;
  }, [
    bookWordCount,
    artifactTypes,
    dismissed,
    toasted,
    setupComplete,
    bookId,
    openWithWorkflow,
    setOnboardingOffers,
  ]);

  // Clear the badge when leaving the book.
  useEffect(() => {
    return () => setOnboardingOffers([]);
  }, [bookId, setOnboardingOffers]);
}
