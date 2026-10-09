"use client";

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
  ScissorsIcon,
  UnfoldVerticalIcon,
  PenLineIcon,
  FileDiffIcon,
  FishingHookIcon,
} from "lucide-react";
import { useState } from "react";
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
import { useStructureMoves } from "./use-structure-moves";
import type { StructureMove } from "@/lib/structure/types";
import { LIVE_MOVE_STATUSES } from "@/lib/structure/types";
import { groupMoves } from "@/lib/structure/group";
import { DraftComparison } from "./draft-comparison";
import { BookMap } from "./book-map";
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


const KIND_ICONS: Record<string, React.ElementType> = {
  reorder: ArrowRightLeftIcon,
  renumber: HashIcon,
  merge: MergeIcon,
  split: SplitIcon,
  trim: ScissorsIcon,
  expand: UnfoldVerticalIcon,
  hook: FishingHookIcon,
};

const isRewrite = (kind: string) => kind === "trim" || kind === "expand" || kind === "hook";

/** The kind's name in the writer's language. */
function kindLabelOf(kind: string, s: ReturnType<typeof useLanguage>["t"]["structure"]): string {
  const labels: Record<string, string> = {
    merge: s.kindMerge,
    split: s.kindSplit,
    renumber: s.kindRenumber,
    trim: s.kindTrim,
    expand: s.kindExpand,
    hook: s.kindHook,
  };
  return labels[kind] ?? s.kindReorder;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  drafted: "default",
  applied: "secondary",
  accepted: "secondary",
  rejected: "outline",
  failed: "destructive",
  undone: "outline",
  superseded: "outline",
  withdrawn: "outline",
};

export function StructureTab({ bookId }: { bookId: string }) {
  const { t } = useLanguage();
  const s = t.structure;
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);
  const {
    moves,
    isLoading,
    isError,
    error,
    busyId,
    isDeciding,
    decide,
    undo,
    isDrafting,
    makeDraft,
    discardDraft,
  } = useStructureMoves(bookId);

  /** What every card needs, whatever list it sits in. */
  const cardProps = (move: StructureMove) => ({
    move,
    bookId,
    strings: s,
    busy: busyId === move.id || isDeciding,
    drafting: isDrafting(move),
    onAccept: () => decide.mutate({ id: move.id, decision: "accept" }),
    onReject: () => decide.mutate({ id: move.id, decision: "reject" }),
    onUndo: () => undo.mutate(move.id),
    onDraft: () => makeDraft.mutate(move.id),
    onDiscard: () => discardDraft.mutate(move.id),
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

  const pending = moves.filter((m) => ["pending", "drafting", "drafted"].includes(m.status));

  // A move the writer decided against, or undid, or that could not run, left no
  // mark on the book and offers no action. Keeping it in the main list buried
  // the live proposals and made a page full of dead cards look like the whole
  // feature (S3-7). It stays readable, in a fold, under its own heading.
  const live = moves.filter((m) => LIVE_MOVE_STATUSES.includes(m.status));
  // The pass as the chat presents it: numbered in filing order, each
  // alternative right under the move it would replace.
  const groups = groupMoves(live);
  const history = moves.filter((m) => !LIVE_MOVE_STATUSES.includes(m.status));

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

      {/* The shape the editor reasoned over, with its proposals pinned to their
          chapters, before the proposals themselves (dev editor v2). */}
      <BookMap
        bookId={bookId}
        moves={moves.filter((m) => LIVE_MOVE_STATUSES.includes(m.status))}
        s={s as unknown as Record<string, string>}
        kindLabel={(kind) => kindLabelOf(kind, s)}
      />

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
          <ol className="space-y-3">
            {groups.map(({ move, alternatives }, i) => (
              <li key={move.id} className="space-y-2">
                <MoveCard {...cardProps(move)} position={i + 1} />
                {alternatives.length > 0 && (
                  <div className="ml-4 space-y-2 border-l-2 border-muted pl-4">
                    <p className="text-xs font-medium text-muted-foreground">{s.alternativeTo}</p>
                    {alternatives.map((alt) => (
                      <MoveCard key={alt.id} {...cardProps(alt)} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Moves that were adopted change what the chapters need, so the pass
          hands off to the developmental edit rather than ending here (S3-18). */}
      {moves.some((m) => m.status === "applied") && pending.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t.reportTabs.nextStep}</p>
            <p className="text-sm text-muted-foreground">
              {t.reportTabs.structureNext}
            </p>
          </div>
          <Button
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => openWithWorkflow("dev-edit")}
          >
            {t.reportTabs.structureNextDo}
          </Button>
        </div>
      )}

      {history.length > 0 && (
        <details className="rounded-md border px-4 py-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground">
            {s.history.replace("{n}", String(history.length))}
          </summary>
          <div className="mt-3 space-y-3">
            {history.map((move) => (
              <MoveCard key={move.id} {...cardProps(move)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MoveCard({
  move,
  bookId,
  position,
  strings: s,
  busy,
  drafting,
  onAccept,
  onReject,
  onUndo,
  onDraft,
  onDiscard,
}: {
  move: StructureMove;
  bookId: string;
  drafting: boolean;
  onDraft: () => void;
  onDiscard: () => void;
  /** The move's number in the pass, matching the chat's list; none for alternatives. */
  position?: number;
  strings: ReturnType<typeof useLanguage>["t"]["structure"];
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
}) {
  const Icon = KIND_ICONS[move.kind] ?? NetworkIcon;
  const [comparing, setComparing] = useState(false);
  const kindLabel = kindLabelOf(move.kind, s);
  const rewrite = isRewrite(move.kind);

  const statusLabels: Record<string, string> = {
    pending: s.pending,
    drafting: s.pending,
    drafted: s.drafted,
    applied: s.applied,
    rejected: s.rejected,
    failed: s.failed,
    undone: s.undone,
    superseded: s.superseded,
    withdrawn: s.withdrawn,
  };
  const statusLabel = statusLabels[move.status] ?? s.accepted;

  return (
    <Card className={cn(move.status === "pending" && "border-primary/40")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">
            {position !== undefined && <span className="mr-1 tabular-nums">{position}.</span>}
            {describeMove(move, s)}
          </CardTitle>
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
          // The engine records its result in English. Rather than print the
          // developer's sentence at the writer, the same fact is rebuilt from
          // the move itself (D-204).
          <p className="text-sm text-muted-foreground">
            {describeMoveResult(move, s)}
          </p>
        )}

        {rewrite && move.status === "drafted" && move.draft && (
          <p className="text-sm text-muted-foreground">
            {s.draftWords
              .replace("{from}", String(move.draft.baseWords ?? "?"))
              .replace("{to}", String(move.draft.draftWords ?? "?"))}
          </p>
        )}
        {rewrite && drafting && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {s.drafting}
          </p>
        )}
        {rewrite && move.status === "drafted" && comparing && (
          <DraftComparison
            bookId={bookId}
            moveId={move.id}
            labels={{ now: s.draftNow, draft: s.draftAfter, error: s.draftError }}
          />
        )}
        <div className="flex flex-wrap gap-2">
          {rewrite && (move.status === "pending" || move.status === "drafting") && (
            <>
              <Button size="sm" onClick={onDraft} disabled={busy || drafting}>
                {drafting ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <PenLineIcon className="mr-1.5 size-3.5" />
                )}
                {s.makeDraft}
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} disabled={busy || drafting}>
                <XIcon className="mr-1.5 size-3.5" />
                {s.reject}
              </Button>
            </>
          )}
          {rewrite && move.status === "drafted" && (
            <>
              <Button size="sm" variant="outline" onClick={() => setComparing((c) => !c)}>
                <FileDiffIcon className="mr-1.5 size-3.5" />
                {comparing ? s.hideDraft : s.viewDraft}
              </Button>
              <Button size="sm" onClick={onAccept} disabled={busy}>
                {busy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="mr-1.5 size-3.5" />
                )}
                {s.applyDraft}
              </Button>
              <Button size="sm" variant="outline" onClick={onDiscard} disabled={busy}>
                {s.discardDraft}
              </Button>
              <Button size="sm" variant="ghost" onClick={onReject} disabled={busy}>
                <XIcon className="mr-1.5 size-3.5" />
                {s.reject}
              </Button>
            </>
          )}
          {!rewrite && move.status === "pending" && (
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

/** What the move did, in the writer's language, built from the move (D-204). */
export function describeMoveResult(
  move: Pick<StructureMove, "kind" | "payload" | "resultSummary" | "draft">,
  s: {
    doneReorder: string;
    doneMerge: string;
    doneSplit: string;
    doneTrim: string;
    doneExpand: string;
    doneHookOpening: string;
    doneHookEnding: string;
  }
): string {
  const p = move.payload ?? {};
  if (move.kind === "hook") {
    return (p.scope === "opening" ? s.doneHookOpening : s.doneHookEnding).replace(
      "{n}",
      String(p.chapterNumber ?? "?")
    );
  }
  if (move.kind === "trim" || move.kind === "expand") {
    return (move.kind === "trim" ? s.doneTrim : s.doneExpand)
      .replace("{n}", String(p.chapterNumber ?? "?"))
      .replace("{from}", String(move.draft?.baseWords ?? "?"))
      .replace("{to}", String(move.draft?.draftWords ?? "?"));
  }
  if (move.kind === "merge") {
    return s.doneMerge.replace("{list}", (p.chapterNumbers ?? []).join(" + "));
  }
  if (move.kind === "split") {
    return s.doneSplit.replace("{n}", String(p.chapterNumber ?? "?"));
  }
  if (move.kind === "reorder" || move.kind === "renumber") {
    return s.doneReorder.replace("{n}", String(p.chapterNumber ?? "?"));
  }
  // An unknown kind keeps the engine's own record rather than inventing one.
  return move.resultSummary ?? "";
}

/** Render the move as one plain sentence in the writer's language. */
export function describeMove(
  move: Pick<StructureMove, "kind" | "payload">,
  s: {
    moveReorder: string;
    moveMerge: string;
    moveSplit: string;
    moveTrim: string;
    moveExpand: string;
    moveHookOpening: string;
    moveHookEnding: string;
  }
): string {
  const p = move.payload ?? {};
  if (move.kind === "hook") {
    return (p.scope === "opening" ? s.moveHookOpening : s.moveHookEnding).replace(
      "{n}",
      String(p.chapterNumber ?? "?")
    );
  }
  if (move.kind === "trim" || move.kind === "expand") {
    return (move.kind === "trim" ? s.moveTrim : s.moveExpand)
      .replace("{n}", String(p.chapterNumber ?? "?"))
      .replace("{w}", String(p.targetWords ?? "?"));
  }
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
