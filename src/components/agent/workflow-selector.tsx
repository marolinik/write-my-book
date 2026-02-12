"use client";

import { useState } from "react";
import {
  BookOpenIcon,
  LibraryIcon,
  PaletteIcon,
  PenLineIcon,
  SearchIcon,
  SparklesIcon,
  ChevronRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAllWorkflows } from "@/lib/agents/workflows";
import type { WorkflowDefinition } from "@/lib/agents/types";
import { useLanguage } from "@/components/providers/language-provider";

const CATEGORY_ICONS = {
  setup: SparklesIcon,
  writing: PenLineIcon,
  editing: SearchIcon,
  analysis: BookOpenIcon,
  style: PaletteIcon,
  series: LibraryIcon,
} as const;

interface WorkflowSelectorProps {
  bookId: string;
  chapters: Array<{ chapterNumber: number; title: string | null }>;
  onSelect: (workflowId: string, chapterNumber?: number) => void;
  disabled?: boolean;
  seriesId?: string;
}

export function WorkflowSelector({
  bookId: _bookId,
  chapters,
  onSelect,
  disabled,
  seriesId,
}: WorkflowSelectorProps) {
  const { t } = useLanguage();
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<WorkflowDefinition | null>(null);
  const [chapterNumber, setChapterNumber] = useState<number | undefined>();

  const workflows = getAllWorkflows();

  const categoryLabels: Record<string, string> = {
    setup: t.workflowSelector.setup,
    writing: t.workflowSelector.writing,
    editing: t.workflowSelector.editing,
    analysis: t.workflowSelector.analysis,
    style: t.workflowSelector.style,
    series: t.workflowSelector.series,
  };
  const categories = [
    "setup",
    "writing",
    "editing",
    "analysis",
    "style",
    ...(seriesId ? (["series"] as const) : []),
  ] as const;

  const handleSelect = (workflow: WorkflowDefinition) => {
    if (workflow.requiresChapter) {
      setSelectedWorkflow(workflow);
      setChapterNumber(chapters[0]?.chapterNumber);
    } else {
      onSelect(workflow.id);
    }
  };

  const handleConfirm = () => {
    if (selectedWorkflow) {
      onSelect(selectedWorkflow.id, chapterNumber);
      setSelectedWorkflow(null);
    }
  };

  // Chapter selection sub-view
  if (selectedWorkflow) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">{selectedWorkflow.label}</div>
        <p className="text-xs text-muted-foreground">
          {t.workflowSelector.selectChapter}
        </p>
        <div className="flex flex-col gap-1">
          {chapters.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t.workflowSelector.noChapters}
            </p>
          ) : (
            <ScrollArea className="max-h-48">
              {chapters.map((ch) => (
                <button
                  key={ch.chapterNumber}
                  onClick={() => setChapterNumber(ch.chapterNumber)}
                  className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    chapterNumber === ch.chapterNumber
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  Ch {ch.chapterNumber}
                  {ch.title ? `: ${ch.title}` : ""}
                </button>
              ))}
            </ScrollArea>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedWorkflow(null)}
          >
            {t.workflowSelector.back}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!chapterNumber || chapters.length === 0}
          >
            {t.workflowSelector.start}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-4 p-4">
        <p className="text-xs text-muted-foreground">
          {t.workflowSelector.chooseWorkflow}
        </p>
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const catWorkflows = workflows.filter((w) => w.category === cat);
          if (catWorkflows.length === 0) return null;

          return (
            <div key={cat} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Icon className="size-3" />
                {categoryLabels[cat]}
              </div>
              {catWorkflows.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleSelect(w)}
                  disabled={disabled}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{w.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {w.writerDescription}
                    </span>
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
