"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/components/providers/language-provider";
import { describeMoveError } from "./describe-move-error";
import type { StructureMove } from "@/lib/structure/types";

/**
 * Loading, deciding and undoing structural proposals.
 *
 * Lifted out of StructureTab so the agent panel can offer the same decision
 * without a second copy of it. The writer asks the editor for moves inside the
 * panel and should be able to answer there (S3-7); duplicating the fetch and
 * the two mutations would be two places to forget to invalidate the chapter
 * list, and the chapter list is the thing a move rewrites.
 *
 * Accepting stays the only path in the feature that touches the manuscript, and
 * it still runs through the same endpoint — the agent has no tool that mutates
 * structure, by design.
 */
export function useStructureMoves(bookId: string) {
  const { t } = useLanguage();
  const s = t.structure;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Survives the render gap that `busyId` cannot cover. */
  const inFlight = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["structure-moves", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/structure/moves`);
      if (!res.ok) throw new Error("load failed");
      return res.json() as Promise<{ moves: StructureMove[] }>;
    },
  });

  /** A move rewrites chapters, so both caches have to go. */
  const refresh = () => {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ["structure-moves", bookId] });
    queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
  };

  const decide = useMutation({
    mutationFn: async (vars: { id: string; decision: "accept" | "reject" }) => {
      // Re-entry guard. The buttons disable on `busyId`, but that is set from
      // inside the mutation, so a fast double-click fires twice before React
      // re-renders: the first accept applied the move and the second came back
      // `not_pending`, painting a red banner over work that had succeeded
      // (S3-7). Checked against the ref because state is a render behind.
      if (inFlight.current) return null;
      inFlight.current = vars.id;
      setBusyId(vars.id);
      const res = await fetch(
        `/api/books/${bookId}/structure/moves/${vars.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: vars.decision }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        // The move already left `pending` — almost always because this very
        // writer just decided it. That is not a failure to report; re-reading
        // the list shows him its real state, which answers him better than a
        // banner would.
        if (body?.code === "not_pending") return null;
        throw new Error(
          describeMoveError(body?.code, body?.error ?? s.applyError, s)
        );
      }
      return body;
    },
    onSuccess: refresh,
    onError: (e: Error) => setError(`${s.applyError}: ${e.message}`),
    onSettled: () => {
      inFlight.current = null;
      setBusyId(null);
    },
  });

  const undo = useMutation({
    mutationFn: async (id: string) => {
      if (inFlight.current) return null;
      inFlight.current = id;
      setBusyId(id);
      const res = await fetch(`/api/books/${bookId}/structure/moves/${id}/undo`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        if (body?.code === "not_pending") return null;
        throw new Error(
          describeMoveError(body?.code, body?.error ?? s.undoError, s)
        );
      }
      return body;
    },
    onSuccess: refresh,
    onError: (e: Error) => setError(`${s.undoError}: ${e.message}`),
    onSettled: () => {
      inFlight.current = null;
      setBusyId(null);
    },
  });

  const moves = query.data?.moves ?? [];

  return {
    moves,
    /**
     * Any decision in flight locks every button, not just its own: applying a
     * move renumbers the book underneath the others, so a second decision
     * taken mid-flight would be answering a question that has changed.
     */
    isDeciding: busyId !== null,
    pending: moves.filter((m) => m.status === "pending"),
    isLoading: query.isLoading,
    isError: query.isError,
    error,
    setError,
    busyId,
    decide,
    undo,
  };
}
