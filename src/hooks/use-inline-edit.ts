"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  InlineEditRequest,
  InlineEditResponse,
} from "@/lib/validation";

async function fetchInlineEdit(
  bookId: string,
  data: InlineEditRequest
): Promise<InlineEditResponse> {
  const res = await fetch(`/api/books/${bookId}/inline-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
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
    mutationFn: (data: InlineEditRequest) => fetchInlineEdit(bookId, data),
  });
}
