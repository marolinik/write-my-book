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

export function FindingCard({ finding, bookId }: FindingCardProps) {
  const [showSuggestion, setShowSuggestion] = useState(false);
  const { selectedFindingId, setSelectedFinding } = useEditorialStore();
  const applyMutation = useApplyFinding(bookId);
  const dismissMutation = useDismissFinding(bookId);
  const undoMutation = useUndoFinding(bookId);

  const isSelected = selectedFindingId === finding.id;
  const isMutating =
    applyMutation.isPending ||
    dismissMutation.isPending ||
    undoMutation.isPending;

  return (
    <Card
      className={`cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
      onClick={() => setSelectedFinding(finding.id)}
    >
      <CardContent className="p-4 space-y-2">
        {/* Top row: severity + category + status */}
        <div className="flex items-center gap-2 flex-wrap">
          {severityBadge(finding.severity)}
          <Badge variant="secondary">{finding.category}</Badge>
          <div className="ml-auto">{statusBadge(finding.status)}</div>
        </div>

        {/* Description */}
        <p className="text-sm">{finding.description}</p>

        {/* Location */}
        {finding.locationStart && (
          <p className="text-xs text-muted-foreground">
            Location: {finding.locationStart}
            {finding.locationEnd ? ` - ${finding.locationEnd}` : ""}
          </p>
        )}

        {/* Suggestion toggle */}
        {finding.suggestion && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-xs text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setShowSuggestion((prev) => !prev);
              }}
            >
              {showSuggestion ? "Hide suggestion" : "Show suggestion"}
            </Button>
            {showSuggestion && (
              <p className="mt-1 rounded bg-muted p-2 text-xs">
                {finding.suggestion}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          {finding.status === "pending" && (
            <>
              <Button
                size="sm"
                disabled={isMutating}
                onClick={(e) => {
                  e.stopPropagation();
                  applyMutation.mutate(finding.id);
                }}
              >
                Apply
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
          {(finding.status === "applied" || finding.status === "dismissed") && (
            <Button
              variant="outline"
              size="sm"
              disabled={isMutating}
              onClick={(e) => {
                e.stopPropagation();
                undoMutation.mutate(finding.id);
              }}
            >
              Undo
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
