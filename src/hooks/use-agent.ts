"use client";

import { useMutation } from "@tanstack/react-query";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Start a new agent session. */
export function useStartSession(bookId: string) {
  return useMutation({
    mutationFn: (data: {
      workflowId: string;
      chapterNumber?: number;
      message?: string;
    }) =>
      fetchJson<{ sessionId: string }>(`/api/books/${bookId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

/** Start a series-aware agent session. */
export function useStartSeriesSession(seriesId: string) {
  return useMutation({
    mutationFn: (data: {
      workflowId: string;
      bookId: string;
      chapterNumber?: number;
      message?: string;
    }) =>
      fetchJson<{ sessionId: string }>(`/api/series/${seriesId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
  });
}

/** Send a message to a conversational session. */
export function useSendMessage(bookId: string, sessionId: string | null) {
  return useMutation({
    mutationFn: (message: string) => {
      if (!sessionId) throw new Error("No active session");
      return fetchJson<{ ok: boolean }>(
        `/api/books/${bookId}/agent/${sessionId}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        }
      );
    },
  });
}

/** Resolve an approval gate. */
export function useApproveAction(bookId: string, sessionId: string | null) {
  return useMutation({
    mutationFn: (data: {
      approvalId: string;
      decision: "approve" | "reject" | "modify";
      message?: string;
    }) => {
      if (!sessionId) throw new Error("No active session");
      return fetchJson<{ ok: boolean }>(
        `/api/books/${bookId}/agent/${sessionId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
    },
  });
}

/** Cancel a running session. */
export function useCancelSession(bookId: string, sessionId: string | null) {
  return useMutation({
    mutationFn: () => {
      if (!sessionId) throw new Error("No active session");
      return fetchJson<{ ok: boolean }>(
        `/api/books/${bookId}/agent/${sessionId}/cancel`,
        { method: "POST" }
      );
    },
  });
}
