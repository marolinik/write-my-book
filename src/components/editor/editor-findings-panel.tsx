"use client";

import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PenTool, X } from "lucide-react";
import { toast } from "sonner";
import { useFindings, useApplyFinding, useDismissFinding } from "@/hooks/use-editorial";
import type { FindingItem } from "@/hooks/use-editorial";
import { FindingCard } from "@/components/editorial/finding-card";
import { FindingConversation } from "@/components/editorial/finding-conversation";
import { useEditorPaneStore, getOrCreatePaneStore } from "@/stores/editor-store";
import { useEditorialStore } from "@/stores/editorial-store";

interface EditorFindingsPanelProps {
  bookId: string;
  chapterNumber: number;
  onClose: () => void;
  paneId?: string;
  /** Override for jump-to-finding behavior. Scrolls editor to center on finding text. */
  onJumpToFinding?: (finding: FindingItem) => void;
  /** Map of finding ID -> freshness status from editor document comparison. */
  freshnessMap?: Map<string, "fresh" | "stale" | "unanchored">;
}

export function EditorFindingsPanel({
  bookId,
  chapterNumber,
  onClose,
  paneId = "primary",
  onJumpToFinding,
  freshnessMap,
}: EditorFindingsPanelProps) {
  const paneStore = getOrCreatePaneStore(paneId);
  const setScrollToText = (text: string | null) => paneStore.getState().setScrollToText(text);

  const { filters, setFilter, resetFilters } = useEditorialStore();

  // Pass store filters to the API query — always scope to current chapter from props
  const { data, isLoading } = useFindings(bookId, {
    chapterNumber,
    severity: filters.severity ?? undefined,
    category: filters.category ?? undefined,
    status: filters.status ?? undefined,
    agentType: filters.agentType ?? undefined,
  });

  const findings = data?.findings ?? [];

  // Pending count uses a separate unfiltered query would be wasteful;
  // instead compute from filtered results when no status filter is active,
  // or show "pending" count as the total when status=pending is active
  const pendingCount = useMemo(() => {
    if (filters.status === "pending") return findings.length;
    if (filters.status && filters.status !== "pending") return 0;
    return findings.filter((f) => f.status === "pending").length;
  }, [findings, filters.status]);

  const hasActiveFilters = !!(filters.severity || filters.category || filters.status || filters.agentType);

  const { highlightedFindingId, setHighlightedFinding } = useEditorialStore();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const conversationFindingId = useEditorialStore((s) => s.conversationFindingId);
  const setConversationFinding = useEditorialStore((s) => s.setConversationFinding);
  const applyFinding = useApplyFinding(bookId);
  const dismissFinding = useDismissFinding(bookId);
  const convoFinding = findings.find((f) => f.id === conversationFindingId);

  // Auto-scroll to highlighted finding card when annotation/gutter marker is clicked
  useEffect(() => {
    if (!highlightedFindingId) return;

    const cardEl = document.getElementById(
      `finding-card-${highlightedFindingId}`
    );
    if (!cardEl) return;

    // Find the ScrollArea viewport to scroll within — avoid parent scroll bleed
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (viewport) {
      const viewportRect = viewport.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const scrollTop = viewport.scrollTop;
      const desiredTop =
        cardRect.top -
        viewportRect.top +
        scrollTop -
        viewportRect.height / 2 +
        cardRect.height / 2;
      viewport.scrollTo({ top: desiredTop, behavior: "smooth" });
    } else {
      // Fallback if no viewport found
      cardEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    // Pulse animation on the card
    cardEl.classList.add("finding-card-pulse");
    setTimeout(() => cardEl.classList.remove("finding-card-pulse"), 1200);

    // Clear highlighted state after animation
    const clearTimer = setTimeout(() => setHighlightedFinding(null), 1500);
    return () => clearTimeout(clearTimer);
  }, [highlightedFindingId, setHighlightedFinding]);

  const handleShowInText = (finding: FindingItem) => {
    if (onJumpToFinding) {
      onJumpToFinding(finding);
      return;
    }
    const text = finding.originalText;
    if (text) {
      setScrollToText(text);
    } else {
      // No literal text to scroll to — just show the description
      toast.info(finding.description, { duration: 4000 });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <PenTool className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Findings</span>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-xs" aria-hidden="true">
            {pendingCount}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label="Close findings panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Filter chips — compact version of editorial page filters */}
      <div
        role="group"
        aria-label="Filter findings"
        className="flex flex-wrap gap-1 px-2 py-1.5 border-b shrink-0"
      >
        {/* Severity chips */}
        {(["critical", "major", "moderate", "minor"] as const).map((sev) => (
          <button
            key={`sev-${sev}`}
            aria-pressed={filters.severity === sev}
            className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
              filters.severity === sev
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            onClick={() => setFilter("severity", filters.severity === sev ? null : sev)}
          >
            {sev}
          </button>
        ))}

        {/* Status chips */}
        {(["pending", "applied", "dismissed"] as const).map((st) => (
          <button
            key={`st-${st}`}
            aria-pressed={filters.status === st}
            className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
              filters.status === st
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
            onClick={() => setFilter("status", filters.status === st ? null : st)}
          >
            {st}
          </button>
        ))}

        {/* Reset button when any filter is active */}
        {hasActiveFilters && (
          <button
            className="px-2 py-0.5 rounded-full text-[10px] border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
            onClick={resetFilters}
          >
            reset
          </button>
        )}
      </div>

      {convoFinding && (
        <FindingConversation
          key={convoFinding.id}
          bookId={bookId}
          finding={{ ...convoFinding, alternatives: convoFinding.alternatives ?? undefined }}
          onApply={(overrideText) => {
            applyFinding.mutate({ findingId: convoFinding.id, overrideText });
            setConversationFinding(null);
          }}
          onDismiss={(reason) => {
            dismissFinding.mutate({ findingId: convoFinding.id, reason });
            setConversationFinding(null);
          }}
          onClose={() => setConversationFinding(null)}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3 p-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : findings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center flex-1">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? "No findings match the current filters"
              : "No findings for this chapter"}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasActiveFilters
              ? "Try adjusting or resetting the filters"
              : "Run an editorial workflow to generate findings"}
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1" ref={scrollAreaRef}>
          <div className="space-y-2 p-2">
            {findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                bookId={bookId}
                onShowInText={handleShowInText}
                isHighlighted={highlightedFindingId === finding.id}
                isStale={freshnessMap?.get(finding.id) === "stale"}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
