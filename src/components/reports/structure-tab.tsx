"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ArrowRightLeftIcon,
  MergeIcon,
  SplitIcon,
  HashIcon,
  CheckIcon,
  XIcon,
  Undo2Icon,
  NetworkIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLanguage } from "@/components/providers/language-provider";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { cn } from "@/lib/utils";

/**
 * O12 — the writer's side of the structural revision pass.
 *
 * Every move is a decision, never a notification: the panel states plainly that
 * nothing has changed yet, shows what the move would do in the writer's own
 * language, and keeps an accepted move undoable. A move the engine could not run
 * reports the engine's own reason (usually "you edited that chapter since"),
 * because a generic failure here would leave the writer unsure whether their
 * manuscript was touched.
 */

interface StructureMove {
  id: string;
  kind: string;
  status: string;
  reason: string;
  evidence: string | null;
  confidence: number | null;
  resultSummary: string | null;
  rejectionReason: string | null;
  createdAt: string;
  appliedAt: string | null;
  payload: {
    kind?: string;
    chapterNumber?: number;
    targetPosition?: number;
    chapterNumbers?: number[];
    anchorQuote?: string;
    title?: string;
  } | null;
}

const KIND_ICONS: Record<string, React.ElementType> = {
  reorder: ArrowRightLeftIcon,
  renumber: HashIcon,
  merge: MergeIcon,
  split: SplitIcon,
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  applied: "secondary",
  accepted: "secondary",
  rejected: "outline",
  failed: "destructive",
  undone: "outline",
};

export function StructureTab({ bookId }: { bookId: string }) {
  const { t } = useLanguage();
  const s = t.structure;
  const queryClient = useQueryClient();
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["structure-moves", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/structure/moves`);
      if (!res.ok) throw new Error("load failed");
      return res.json() as Promise<{ moves: StructureMove[] }>;
    },
  });

  const decide = useMutation({
    mutationFn: async (vars: { id: string; decision: "accept" | "reject" }) => {
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
      if (!res.ok) throw new Error(body?.error ?? s.applyError);
      return body;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["structure-moves", bookId] });
      queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
    },
    onError: (e: Error) => setError(`${s.applyError}: ${e.message}`),
    onSettled: () => setBusyId(null),
  });

  const undo = useMutation({
    mutationFn: async (id: string) => {
      setBusyId(id);
      const res = await fetch(`/api/books/${bookId}/structure/moves/${id}/undo`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? s.undoError);
      return body;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["structure-moves", bookId] });
      queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
    },
    onError: (e: Error) => setError(`${s.undoError}: ${e.message}`),
    onSettled: () => setBusyId(null),
  });

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {s.loadError}
        </CardContent>
      </Card>
    );
  }

  const moves = data?.moves ?? [];
  const pending = moves.filter((m) => m.status === "pending");

  // A move the writer decided against, or undid, or that could not run, left no
  // mark on the book and offers no action. Keeping it in the main list buried
  // the live proposals and made a page full of dead cards look like the whole
  // feature (S3-7). It stays readable, in a fold, under its own heading.
  const LIVE = ["pending", "accepted", "applied"];
  const live = moves.filter((m) => LIVE.includes(m.status));
  const history = moves.filter((m) => !LIVE.includes(m.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="text-sm text-muted-foreground">{s.subtitle}</p>
        </div>
        <Button size="sm" onClick={() => openWithWorkflow("restructure")}>
          <SparklesIcon className="mr-1.5 size-3.5" />
          {s.runPass}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {live.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <NetworkIcon className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">{s.empty}</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {s.emptyDesc}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => openWithWorkflow("restructure")}>
              {s.runPass}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <p className="text-sm text-muted-foreground">{s.nothingChangesYet}</p>
          )}
          <div className="space-y-3">
            {live.map((move) => (
              <MoveCard
                key={move.id}
                move={move}
                strings={s}
                busy={busyId === move.id}
                onAccept={() => decide.mutate({ id: move.id, decision: "accept" })}
                onReject={() => decide.mutate({ id: move.id, decision: "reject" })}
                onUndo={() => undo.mutate(move.id)}
              />
            ))}
          </div>
        </>
      )}

      {history.length > 0 && (
        <details className="rounded-md border px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground">
            {s.history.replace("{n}", String(history.length))}
          </summary>
          <div className="mt-3 space-y-3">
            {history.map((move) => (
              <MoveCard
                key={move.id}
                move={move}
                strings={s}
                busy={busyId === move.id}
                onAccept={() => decide.mutate({ id: move.id, decision: "accept" })}
                onReject={() => decide.mutate({ id: move.id, decision: "reject" })}
                onUndo={() => undo.mutate(move.id)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MoveCard({
  move,
  strings: s,
  busy,
  onAccept,
  onReject,
  onUndo,
}: {
  move: StructureMove;
  strings: ReturnType<typeof useLanguage>["t"]["structure"];
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const Icon = KIND_ICONS[move.kind] ?? NetworkIcon;
  const kindLabel =
    move.kind === "merge"
      ? s.kindMerge
      : move.kind === "split"
        ? s.kindSplit
        : move.kind === "renumber"
          ? s.kindRenumber
          : s.kindReorder;

  const statusLabel =
    move.status === "pending"
      ? s.pending
      : move.status === "applied"
        ? s.applied
        : move.status === "rejected"
          ? s.rejected
          : move.status === "failed"
            ? s.failed
            : move.status === "undone"
              ? s.undone
              : s.accepted;

  return (
    <Card className={cn(move.status === "pending" && "border-primary/40")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{describeMove(move, s)}</CardTitle>
          <Badge variant="outline">{kindLabel}</Badge>
          <Badge variant={STATUS_VARIANTS[move.status] ?? "outline"}>{statusLabel}</Badge>
          {typeof move.confidence === "number" && (
            <span className="text-xs text-muted-foreground">
              {s.confidence} {Math.round(move.confidence * 100)}%
            </span>
          )}
        </div>
        <CardDescription className="pt-1 text-foreground/80">
          <span className="font-medium text-foreground">{s.reason}: </span>
          {move.reason}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {move.evidence && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{s.evidence}: </span>
            {move.evidence}
          </p>
        )}
        {move.status === "failed" && move.resultSummary && (
          <p className="text-sm text-destructive">{move.resultSummary}</p>
        )}
        {move.status === "applied" && move.resultSummary && (
          <p className="text-sm text-muted-foreground">{move.resultSummary}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {move.status === "pending" && (
            <>
              <Button size="sm" onClick={onAccept} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="mr-1.5 size-3.5" />
                )}
                {s.accept}
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
                <XIcon className="mr-1.5 size-3.5" />
                {s.reject}
              </Button>
            </>
          )}
          {move.status === "applied" && (
            <Button size="sm" variant="outline" onClick={onUndo} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Undo2Icon className="mr-1.5 size-3.5" />
              )}
              {s.undo}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Render the move as one plain sentence in the writer's language. */
export function describeMove(
  move: Pick<StructureMove, "kind" | "payload">,
  s: { moveReorder: string; moveMerge: string; moveSplit: string }
): string {
  const p = move.payload ?? {};
  if (move.kind === "merge") {
    const list = (p.chapterNumbers ?? []).join(" + ");
    return s.moveMerge.replace("{list}", list);
  }
  if (move.kind === "split") {
    return s.moveSplit
      .replace("{n}", String(p.chapterNumber ?? "?"))
      .replace("{anchor}", p.anchorQuote ?? "");
  }
  return s.moveReorder
    .replace("{n}", String(p.chapterNumber ?? "?"))
    .replace("{p}", String(p.targetPosition ?? "?"));
}
