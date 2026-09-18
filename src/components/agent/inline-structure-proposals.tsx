"use client";

import { Loader2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { useStructureMoves } from "@/components/reports/use-structure-moves";
import { describeMove } from "@/components/reports/structure-tab";

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
  const { pending, error, busyId, isDeciding, decide } = useStructureMoves(bookId);

  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background/60 p-2">
      <span className="text-xs font-medium">
        {s.awaitingDecision.replace("{n}", String(pending.length))}
      </span>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      {pending.map((move) => (
        <div key={move.id} className="flex flex-col gap-1.5 rounded border p-2">
          <span className="text-xs leading-snug">{describeMove(move, s)}</span>

          <div className="flex items-center gap-1.5">
            {move.confidence !== null && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {Math.round(move.confidence * 100)}%
              </Badge>
            )}
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={isDeciding}
              onClick={() => decide.mutate({ id: move.id, decision: "accept" })}
            >
              {busyId === move.id && (
                <Loader2Icon className="mr-1 size-3 animate-spin" />
              )}
              {s.accept}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={isDeciding}
              onClick={() => decide.mutate({ id: move.id, decision: "reject" })}
            >
              {s.reject}
            </Button>
          </div>
        </div>
      ))}

      <span className="text-[11px] text-muted-foreground">
        {s.nothingChangesYet}
      </span>
    </div>
  );
}
