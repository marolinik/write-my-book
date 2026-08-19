"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  consumeDiscussStream,
  type DiscussTurnResult,
} from "@/lib/editorial/discuss-stream-client";
import { DISCUSS_TURN_CANCELLED } from "@/lib/editorial/discuss-turn-notice";

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
  /**
   * D-177: the ONE flag the thread's live bubble and every settle-racing control
   * read. `mutation.isPending` cannot be it: react-query holds it true until
   * `onSettled`'s `invalidateQueries` resolves, so for 50-189 ms the settled
   * bubble and the waiting-line bubble were both mounted and the finished reply
   * was visibly re-covered by "The editor is replying…". This flips false in the
   * same commit that appends the settled reply.
   *
   * D-176: `turnStartedAt` is the clock the wait line counts from.
   */
  const [turnActive, setTurnActive] = useState(false);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);

  /**
   * D-176: the abort handle for the turn in flight. Aborting the fetch aborts
   * the route's `req.signal`, and the server's all-or-nothing path then settles
   * nothing, persists nothing and consumes no exchange (D-142) — which is what
   * makes offering Cancel during the 19-36 s pre-first-token wall honest.
   */
  const abortRef = useRef<AbortController | null>(null);
  /** True only when the WRITER aborted, so a cancel never wears error copy. */
  const cancelledRef = useRef(false);

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
      const controller = new AbortController();
      abortRef.current = controller;
      cancelledRef.current = false;
      try {
        const res = await fetch(`/api/books/${bookId}/editorial/findings/${findingId}/discuss`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ writerMessage }),
          signal: controller.signal,
        });
        if (res.status === 429) throw new Error("rate_limited");

        // D5: feature-detect the stream. A provider route that cannot stream (or a
        // pre-first-token failure) answers the historical JSON, which is consumed
        // by the branch below byte-for-byte as before.
        const contentType = res.headers?.get?.("content-type") ?? "";
        if (res.ok && contentType.includes("text/event-stream")) {
          return await consumeDiscussStream(res, {
            onText: (delta) => setStreamingText((prev) => prev + delta),
            signal: controller.signal,
          });
        }

        if (!res.ok && res.status !== 409) throw new Error("Failed to send");
        return (await res.json()) as DiscussTurnResult;
      } catch (err) {
        // A writer-initiated cancel is an outcome, not a failure: the fetch
        // rejects with AbortError before the first byte, and after it the
        // reader returns silently and `consumeDiscussStream` reports the
        // truncation message. Both become one sentinel the thread can phrase
        // honestly (discuss-turn-notice.ts).
        if (cancelledRef.current || (err as Error)?.name === "AbortError") {
          throw new Error(DISCUSS_TURN_CANCELLED);
        }
        throw err;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    // Optimistic append of the writer's message.
    onMutate: async (writerMessage) => {
      await qc.cancelQueries({ queryKey: key });
      setStreamingText("");
      setTurnActive(true);
      setTurnStartedAt(Date.now());
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
     *
     * D-177: the cache write and the three state writes below are one React
     * commit (automatic batching), so the settled bubble replaces the live one
     * atomically — the waiting line can never re-cover a finished reply.
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
      setTurnActive(false);
      setTurnStartedAt(null);
    },
    // Roll back on failure, then re-hydrate from the server so counts never diverge (spec §6.1).
    onError: (_e, _v, ctxData) => {
      if (ctxData?.prev) qc.setQueryData(key, ctxData.prev);
      setStreamingText("");
      setTurnActive(false);
      setTurnStartedAt(null);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  /**
   * D-176: abort the turn in flight. Safe to call when nothing is running.
   * `cancelledRef` is set BEFORE the abort so the rejection that follows is
   * classified as a cancel wherever it surfaces from.
   */
  const cancel = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    cancelledRef.current = true;
    controller.abort();
  }, []);

  return {
    replies: query.data?.replies ?? [],
    userTurns: query.data?.userTurns ?? 0,
    canDiscuss: query.data?.canDiscuss ?? true,
    isLoading: query.isLoading,
    send: mutation.mutateAsync,
    /**
     * react-query's own pending flag — stays true until the post-settle
     * invalidate resolves. Use `turnActive` for anything the writer can see
     * (D-177).
     */
    isSending: mutation.isPending,
    /** Prose streamed so far for the in-flight turn ("" when none/idle). */
    streamingText,
    /** A turn is in flight: waiting line, wait chrome and settle-guards read this. */
    turnActive,
    /** Epoch ms the in-flight turn started, or null when idle (D-176 counter). */
    turnStartedAt,
    /** Abort the turn in flight — nothing is saved and no exchange is used. */
    cancel,
  };
}
