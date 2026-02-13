"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useApplyFinding,
  useDismissFinding,
  useUndoFinding,
} from "@/hooks/use-editorial";
import type { FindingItem } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { Check, X, Undo2, AlertTriangle } from "lucide-react";

interface FindingCardProps {
  finding: FindingItem;
  bookId: string;
}

function severityBadge(severity: string) {
  switch (severity) {
    case "critical":
      return <Badge variant="destructive">critical</Badge>;
    case "major":
      return (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
          major
        </Badge>
      );
    case "moderate":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
          moderate
        </Badge>
      );
    case "minor":
      return <Badge variant="outline">minor</Badge>;
    default:
      return <Badge variant="secondary">{severity}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline">pending</Badge>;
    case "applied":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          applied
        </Badge>
      );
    case "dismissed":
      return <Badge variant="secondary">dismissed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

/** Inline diff view showing original (red strikethrough) and replacement (green) */
function InlineDiff({
  originalText,
  newText,
}: {
  originalText: string;
  newText: string;
}) {
  return (
    <div className="rounded border border-border bg-muted/30 p-3 text-sm font-mono leading-relaxed space-y-1">
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-red-500 font-bold select-none">-</span>
        <span className="text-red-700 dark:text-red-400 line-through decoration-red-400/60">
          {originalText}
        </span>
      </div>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-green-500 font-bold select-none">+</span>
        <span className="text-green-700 dark:text-green-400">
          {newText}
        </span>
      </div>
    </div>
  );
}

export function FindingCard({ finding, bookId }: FindingCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const { selectedFindingId, setSelectedFinding } = useEditorialStore();
  const applyMutation = useApplyFinding(bookId);
  const dismissMutation = useDismissFinding(bookId);
  const undoMutation = useUndoFinding(bookId);

  const isSelected = selectedFindingId === finding.id;
  const isMutating =
    applyMutation.isPending ||
    dismissMutation.isPending ||
    undoMutation.isPending;

  const isAutoAppliable = !!(finding.originalText && finding.newText);

  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    setApplyError(null);
    applyMutation.mutate(finding.id, {
      onError: (error: Error) => {
        // Show 409 conflict errors inline
        if (error.message.includes("not found in chapter")) {
          setApplyError(
            "Original text not found in chapter — it may have been edited since this finding was created."
          );
        }
      },
    });
  };

  return (
    <Card
      className={`cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
      onClick={() => setSelectedFinding(finding.id)}
    >
      <CardContent className="p-4 space-y-2">
        {/* Top row: severity + category + status + auto-apply indicator */}
        <div className="flex items-center gap-2 flex-wrap">
          {severityBadge(finding.severity)}
          <Badge variant="secondary">{finding.category}</Badge>
          {isAutoAppliable && finding.status === "pending" && (
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">
              auto-apply
            </Badge>
          )}
          <div className="ml-auto">{statusBadge(finding.status)}</div>
        </div>

        {/* Description */}
        <p className="text-sm">{finding.description}</p>

        {/* Chapter reference */}
        {finding.chapterNumber && (
          <p className="text-xs text-muted-foreground">
            Chapter {finding.chapterNumber}
            {finding.locationStart ? ` — ${finding.locationStart}` : ""}
            {finding.locationEnd ? ` to ${finding.locationEnd}` : ""}
          </p>
        )}

        {/* Diff view for auto-appliable findings */}
        {isAutoAppliable && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails((prev) => !prev);
              }}
            >
              {showDetails ? "Hide diff" : "Show diff"}
            </Button>
            {showDetails && (
              <div className="mt-2">
                <InlineDiff
                  originalText={finding.originalText!}
                  newText={finding.newText!}
                />
              </div>
            )}
          </div>
        )}

        {/* Suggestion for advice-only findings */}
        {!isAutoAppliable && finding.suggestion && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails((prev) => !prev);
              }}
            >
              {showDetails ? "Hide suggestion" : "Show suggestion"}
            </Button>
            {showDetails && (
              <p className="mt-1 rounded bg-muted p-2 text-xs">
                {finding.suggestion}
              </p>
            )}
          </div>
        )}

        {/* Apply error message */}
        {applyError && (
          <div className="flex items-start gap-2 rounded bg-orange-50 dark:bg-orange-950/30 p-2 text-xs text-orange-800 dark:text-orange-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{applyError}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          {finding.status === "pending" && (
            <>
              {isAutoAppliable ? (
                <>
                  <Button
                    size="sm"
                    disabled={isMutating}
                    onClick={handleApply}
                    className="gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissMutation.mutate({ findingId: finding.id });
                    }}
                    className="gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    disabled={isMutating}
                    onClick={(e) => {
                      e.stopPropagation();
                      applyMutation.mutate(finding.id);
                    }}
                  >
                    Mark as Done
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isMutating}
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissMutation.mutate({ findingId: finding.id });
                    }}
                  >
                    Dismiss
                  </Button>
                </>
              )}
            </>
          )}
          {(finding.status === "applied" || finding.status === "dismissed") && (
            <Button
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={(e) => {
                e.stopPropagation();
                undoMutation.mutate(finding.id);
              }}
              className="gap-1"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
