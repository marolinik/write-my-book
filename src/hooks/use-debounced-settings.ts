"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateBookSettings, type BookSettingsData } from "@/hooks/use-settings";
import { toast } from "sonner";

/**
 * Wraps book settings mutation with 300ms debounce.
 * Accumulates multiple field changes into a single batched API call.
 * Provides optimistic UI updates via React Query cache.
 *
 * Usage:
 *   const handleChange = useDebouncedSettings(bookId);
 *   handleChange("fieldName", newValue);
 */
export function useDebouncedSettings(bookId: string, delay = 300) {
  const updateSettings = useUpdateBookSettings(bookId);
  const qc = useQueryClient();
  const pendingRef = useRef<Record<string, unknown>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Track mount state to prevent post-unmount mutations
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      // Accumulate the change
      pendingRef.current[field] = value;

      // Optimistic update in React Query cache
      qc.setQueryData<BookSettingsData>(
        ["book-settings", bookId],
        (old) => (old ? { ...old, [field]: value } : old)
      );

      // Clear any existing timer and set a new one
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;

        const batch = { ...pendingRef.current };
        pendingRef.current = {};

        try {
          await updateSettings.mutateAsync(batch);
        } catch (err) {
          // Revert optimistic update on failure by refetching from server
          if (mountedRef.current) {
            qc.invalidateQueries({ queryKey: ["book-settings", bookId] });
            toast.error((err as Error).message);
          }
        }
      }, delay);
    },
    [bookId, updateSettings, qc, delay]
  );

  return handleChange;
}
