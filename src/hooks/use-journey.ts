"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

interface JourneyMutationInput {
  journeyId: string | null;
  journeyStepsSnapshot?: string | null;
}

/**
 * Mutation hook to persist the selected journey ID (and optional steps snapshot)
 * to BookSettings via PATCH /api/books/:id/settings.
 *
 * Invalidates book-settings query on success so useBookState picks up the change.
 */
export function useJourneyMutation(bookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: JourneyMutationInput) => {
      const res = await fetch(`/api/books/${bookId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journeyId: input.journeyId,
          ...(input.journeyStepsSnapshot !== undefined && {
            journeyStepsSnapshot: input.journeyStepsSnapshot,
          }),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to update journey");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book-settings", bookId] });
    },
  });
}
