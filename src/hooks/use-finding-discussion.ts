"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  consumeDiscussStream,
  type DiscussTurnResult,
} from "@/lib/editorial/discuss-stream-client";

export interface DiscussionReply {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  assistantMessage?: string;
  revisedSuggestion?: string;
  revisedReasoning?: string;
  suggestedConstraint?: { category: string; content: string };
}

interface DiscussionData { replies: DiscussionReply[]; userTurns: number; canDiscuss: boolean; }

export function useFindingDiscussion(bookId: string, findingId: string) {
  const qc = useQueryClient();
  const key = ["finding-discussion", bookId, findingId] as const;
  /**
   * D5: prose the editor has streamed so far for the turn in flight. Rendered in
   * a live assistant bubble, then dropped in the SAME commit that appends the
   * settled reply, so the swap cannot flash an empty thread.
   */
  const [streamingText, setStreamingText] = useState("");

  const query = useQuery<DiscussionData>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/editorial/findings/${findingId}/discuss`);
      if (!res.ok) throw new Error("Failed to load conversation");
      return (await res.json()) as DiscussionData;
    },
    staleTime: 10_000,
  });

  const mutation = useMutation({
    mutationFn: async (writerMessage: string): Promise<DiscussTurnResult> => {
      const res = await fetch(`/api/books/${bookId}/editorial/findings/${findingId}/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writerMessage }),
      });
      if (res.status === 429) throw new Error("rate_limited");

      // D5: feature-detect the stream. A provider route that cannot stream (or a
      // pre-first-token failure) answers the historical JSON, which is consumed
      // by the branch below byte-for-byte as before.
      const contentType = res.headers?.get?.("content-type") ?? "";
      if (res.ok && contentType.includes("text/event-stream")) {
        return await consumeDiscussStream(res, {
          onText: (delta) => setStreamingText((prev) => prev + delta),
        });
      }

      if (!res.ok && res.status !== 409) throw new Error("Failed to send");
      return (await res.json()) as DiscussTurnResult;
    },
    // Optimistic append of the writer's message.
    onMutate: async (writerMessage) => {
      await qc.cancelQueries({ queryKey: key });
      setStreamingText("");
      const prev = qc.getQueryData<DiscussionData>(key);
      qc.setQueryData<DiscussionData>(key, (d) => {
        const base = d ?? { replies: [], userTurns: 0, canDiscuss: true };
        return { ...base, replies: [...base.replies, { role: "user", content: writerMessage }] };
      });
      return { prev };
    },
    /**
     * D5: commit the settled reply into the cache immediately, using the RAW text
     * the server persisted. The thread then renders it through the same sanitizer
     * a reload uses (assistantBubbleText → parseDiscussResponse), so control
     * blocks are stripped by exactly one code path and the live bubble can be
     * dropped in the same commit — no gap, no layout jump. The invalidate in
     * onSettled reconciles with the server afterwards.
     */
    onSuccess: (data) => {
      if (!data.capped && typeof data.raw === "string" && data.raw.length > 0) {
        qc.setQueryData<DiscussionData>(key, (d) => {
          const base = d ?? { replies: [], userTurns: 0, canDiscuss: true };
          return {
            ...base,
            replies: [...base.replies, { role: "assistant", content: data.raw as string }],
            userTurns: data.userTurns,
          };
        });
      }
      setStreamingText("");
    },
    // Roll back on failure, then re-hydrate from the server so counts never diverge (spec §6.1).
    onError: (_e, _v, ctxData) => {
      if (ctxData?.prev) qc.setQueryData(key, ctxData.prev);
      setStreamingText("");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    replies: query.data?.replies ?? [],
    userTurns: query.data?.userTurns ?? 0,
    canDiscuss: query.data?.canDiscuss ?? true,
    isLoading: query.isLoading,
    send: mutation.mutateAsync,
    isSending: mutation.isPending,
    /** Prose streamed so far for the in-flight turn ("" when none/idle). */
    streamingText,
  };
}
