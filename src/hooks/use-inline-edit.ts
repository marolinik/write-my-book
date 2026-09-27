"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  InlineEditRequest,
  InlineEditResponse,
} from "@/lib/validation";

/**
 * The request plus the caller's AbortSignal. The signal never goes into the
 * JSON body; it cancels the fetch, and the route (D-142) answers a cancelled
 * request with 499 and bills nothing (P5-S20).
 */
export type InlineEditVariables = InlineEditRequest & { signal?: AbortSignal };

async function fetchInlineEdit(
  bookId: string,
  data: InlineEditRequest,
  signal?: AbortSignal
): Promise<InlineEditResponse> {
  const res = await fetch(`/api/books/${bookId}/inline-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Mutation hook for inline AI text suggestions. */
export function useInlineEdit(bookId: string) {
  return useMutation({
    mutationKey: ["inline-edit", bookId],
    mutationFn: ({ signal, ...data }: InlineEditVariables) =>
      fetchInlineEdit(bookId, data, signal),
  });
}
