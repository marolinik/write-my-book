"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PenTool, X } from "lucide-react";
import { useFindings } from "@/hooks/use-editorial";
import type { FindingItem } from "@/hooks/use-editorial";
import { FindingCard } from "@/components/editorial/finding-card";
import { useEditorPaneStore, getOrCreatePaneStore } from "@/stores/editor-store";

interface EditorFindingsPanelProps {
  bookId: string;
  chapterNumber: number;
  onClose: () => void;
  paneId?: string;
}

export function EditorFindingsPanel({
  bookId,
  chapterNumber,
  onClose,
  paneId = "primary",
}: EditorFindingsPanelProps) {
  const paneStore = getOrCreatePaneStore(paneId);
  const setScrollToText = (text: string | null) => paneStore.getState().setScrollToText(text);
  const setPendingInlineEditFinding = (finding: FindingItem | null) => paneStore.getState().setPendingInlineEditFinding(finding);
  const { data, isLoading } = useFindings(bookId, { chapterNumber });
  const [activeFilter, setActiveFilter] = useState("all");

  const findings = data?.findings ?? [];
  const pendingCount = findings.filter((f) => f.status === "pending").length;

  // Build dynamic filter chips from actual findings data
  const filterChips = useMemo(() => {
    const chips = [{ id: "all", label: "all" }, { id: "pending", label: "pending" }];
    // Add unique severity values
    const severities = new Set(findings.map((f) => f.severity));
    for (const s of ["critical", "major", "moderate", "minor"]) {
      if (severities.has(s)) chips.push({ id: `severity:${s}`, label: s });
    }
    // Add unique category values
    const categories = new Set(findings.map((f) => f.category));
    for (const c of categories) {
      if (c) chips.push({ id: `category:${c}`, label: c });
    }
    return chips;
  }, [findings]);

  // Filter findings based on active chip
  const filteredFindings = useMemo(() => {
    if (activeFilter === "all") return findings;
    if (activeFilter === "pending") return findings.filter((f) => f.status === "pending");
    if (activeFilter.startsWith("severity:")) {
      const sev = activeFilter.replace("severity:", "");
      return findings.filter((f) => f.severity === sev);
    }
    if (activeFilter.startsWith("category:")) {
      const cat = activeFilter.replace("category:", "");
      return findings.filter((f) => f.category === cat);
    }
    return findings;
  }, [findings, activeFilter]);

  const handleShowInText = (finding: FindingItem) => {
    const text = finding.originalText ?? finding.locationStart;
    if (text) setScrollToText(text);
    setPendingInlineEditFinding(finding);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <PenTool className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium flex-1">Findings</span>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-xs">
            {pendingCount}
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Filter chips */}
      {findings.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b shrink-0">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                activeFilter === chip.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
              onClick={() => setActiveFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
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
            No findings for this chapter
          </p>
          <p className="text-xs text-muted-foreground">
            Run an editorial workflow to generate findings
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-2 p-2">
            {filteredFindings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                bookId={bookId}
                onShowInText={handleShowInText}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
