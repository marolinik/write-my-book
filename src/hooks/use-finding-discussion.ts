"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
    mutationFn: async (writerMessage: string) => {
      const res = await fetch(`/api/books/${bookId}/editorial/findings/${findingId}/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writerMessage }),
      });
      if (res.status === 429) throw new Error("rate_limited");
      if (!res.ok && res.status !== 409) throw new Error("Failed to send");
      return (await res.json()) as { assistantMessage?: string; revisedSuggestion?: string; revisedReasoning?: string; suggestedConstraint?: { category: string; content: string }; userTurns: number; capped: boolean };
    },
    // Optimistic append of the writer's message.
    onMutate: async (writerMessage) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DiscussionData>(key);
      qc.setQueryData<DiscussionData>(key, (d) => {
        const base = d ?? { replies: [], userTurns: 0, canDiscuss: true };
        return { ...base, replies: [...base.replies, { role: "user", content: writerMessage }] };
      });
      return { prev };
    },
    // Roll back on failure, then re-hydrate from the server so counts never diverge (spec §6.1).
    onError: (_e, _v, ctxData) => {
      if (ctxData?.prev) qc.setQueryData(key, ctxData.prev);
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
  };
}
