"use client";

import Link from "next/link";
import { Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { useStructureMoves } from "@/components/reports/use-structure-moves";
import { describeMove } from "@/components/reports/structure-tab";
import { groupMoves } from "@/lib/structure/group";
import type { StructureMove } from "@/lib/structure/types";

/**
 * The writer's decision on structural proposals, inside the agent panel.
 *
 * The editor proposes moves in conversation, so the writer answers in
 * conversation — "prihvatam" in the chat does nothing, because the architect
 * has no tool that mutates structure and must not have one. Sending him to
 * another page to click Accept broke the thread of what he had just read
 * (S3-7).
 *
 * This is the same decision, through the same endpoint, rendered where he is:
 * the buttons are his, not the model's. Reasons stay on the full panel — here
 * he gets the move, its confidence, and the two answers.
 */
export function InlineStructureProposals({ bookId }: { bookId: string }) {
  const { t } = useLanguage();
  const s = t.structure;
  const { undecided: pending, error, busyId, isDeciding, decide, isDrafting, makeDraft } =
    useStructureMoves(bookId);

  if (pending.length === 0) return null;
  // Alternatives are answers to a move, not moves of their own.
  const groups = groupMoves(pending);

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background/60 p-2">
      <span className="text-xs font-medium">
        {s.awaitingDecision.replace("{n}", String(groups.length))}
      </span>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {groups.map(({ move, alternatives }, i) => (
        <div key={move.id} className="flex flex-col gap-1.5">
          <ProposalRow
            move={move}
            bookId={bookId}
            label={`${i + 1}. ${describeMove(move, s)}`}
            busy={busyId === move.id || isDrafting(move)}
            disabled={isDeciding || isDrafting(move)}
            s={s}
            onDecide={(decision) => decide.mutate({ id: move.id, decision })}
            onDraft={() => makeDraft.mutate(move.id)}
          />
          {alternatives.length > 0 && (
            <div className="ml-3 flex flex-col gap-1.5 border-l-2 border-muted pl-2">
              <span className="text-[11px] text-muted-foreground">{s.alternativeTo}</span>
              {alternatives.map((alt) => (
                <ProposalRow
                  key={alt.id}
                  move={alt}
                  bookId={bookId}
                  label={describeMove(alt, s)}
                  busy={busyId === alt.id || isDrafting(alt)}
                  disabled={isDeciding || isDrafting(alt)}
                  s={s}
                  onDecide={(decision) => decide.mutate({ id: alt.id, decision })}
                  onDraft={() => makeDraft.mutate(alt.id)}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      <span className="text-[11px] text-muted-foreground">
        {s.nothingChangesYet}
      </span>
    </div>
  );
}

function ProposalRow({
  move,
  bookId,
  label,
  busy,
  disabled,
  s,
  onDecide,
  onDraft,
}: {
  move: StructureMove;
  bookId: string;
  label: string;
  busy: boolean;
  disabled: boolean;
  s: { accept: string; reject: string; makeDraft: string; viewDraft: string };
  onDecide: (decision: "accept" | "reject") => void;
  onDraft: () => void;
}) {
  const rewrite = move.kind === "trim" || move.kind === "expand";
  // A whole-chapter draft is read side by side on the structure tab; the
  // panel is too narrow for it, so it links there instead of accepting blind.
  if (rewrite && move.status === "drafted") {
    return (
      <div className="flex flex-col gap-1.5 rounded border p-2">
        <span className="text-xs leading-snug">{label}</span>
        <Link
          href={`/books/${bookId}/reports?tab=structure`}
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          {s.viewDraft}
        </Link>
      </div>
    );
  }
  const accept = rewrite ? s.makeDraft : s.accept;
  const reject = s.reject;
  return (
    <div className="flex flex-col gap-1.5 rounded border p-2">
      <span className="text-xs leading-snug">{label}</span>

      <div className="flex items-center gap-1.5">
        {move.confidence !== null && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {Math.round(move.confidence * 100)}%
          </Badge>
        )}
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => (rewrite ? onDraft() : onDecide("accept"))}
        >
          {busy && <Loader2Icon className="mr-1 size-3 animate-spin" />}
          {accept}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={disabled}
          onClick={() => onDecide("reject")}
        >
          {reject}
        </Button>
      </div>
    </div>
  );
}
