"use client";

import { useMutation } from "@tanstack/react-query";
import type { PolishSceneRequest, PolishSceneResponse } from "@/lib/validation";

/**
 * A failed polish, with the HTTP status kept so the panel can show the
 * writer's own language instead of the server's English message.
 */
export class PolishSceneError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The route's machine-readable reason, e.g. MODEL_NO_POLISH or SCENE_TOO_LONG. */
    readonly code?: string
  ) {
    super(message);
    this.name = "PolishSceneError";
  }
}

/** The request plus the caller's AbortSignal, which never goes into the body. */
export type PolishSceneVariables = PolishSceneRequest & { signal?: AbortSignal };

async function fetchPolishScene(
  bookId: string,
  data: PolishSceneRequest,
  signal?: AbortSignal
): Promise<PolishSceneResponse> {
  const res = await fetch(`/api/books/${bookId}/polish-scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PolishSceneError(res.status, body.error ?? `Request failed: ${res.status}`, body.code);
  }
  return res.json();
}

/** Mutation hook for a light and a bold rewrite of the selected scene. */
export function usePolishScene(bookId: string) {
  return useMutation({
    mutationKey: ["polish-scene", bookId],
    mutationFn: ({ signal, ...data }: PolishSceneVariables) =>
      fetchPolishScene(bookId, data, signal),
  });
}
