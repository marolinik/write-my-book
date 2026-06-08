"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { PipelineCard, type PipelineChapter } from "./pipeline-card";

const COLUMN_BG: Record<string, string> = {
  undiscussed: "bg-muted/30",
  discussed: "bg-blue-50/50 dark:bg-blue-950/20",
  planned: "bg-indigo-50/50 dark:bg-indigo-950/20",
  drafted: "bg-amber-50/50 dark:bg-amber-950/20",
  dev_edited: "bg-orange-50/50 dark:bg-orange-950/20",
  line_edited: "bg-purple-50/50 dark:bg-purple-950/20",
  beta_read: "bg-pink-50/50 dark:bg-pink-950/20",
  beta_passed: "bg-green-50/50 dark:bg-green-950/20",
};

interface PipelineColumnProps {
  stage: string;
  label: string;
  chapters: PipelineChapter[];
  onCardClick: (chapterId: string) => void;
}

export function PipelineColumn({
  stage,
  label,
  chapters,
  onCardClick,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  const bgClass = COLUMN_BG[stage] ?? "bg-muted/30";

  return (
    <div
      className={`flex flex-col rounded-lg ${bgClass} ${
        isOver ? "ring-2 ring-primary/40" : ""
      } min-w-[160px] w-full`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b">
        <span className="text-xs font-medium">{label}</span>
        <Badge variant="secondary" className="text-[10px] h-5 min-w-[20px] justify-center">
          {chapters.length}
        </Badge>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className="flex-1 p-1.5 space-y-1.5 min-h-[80px]"
      >
        <SortableContext
          items={chapters.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {chapters.length === 0 ? (
            <div className="flex items-center justify-center h-16 rounded border border-dashed text-[10px] text-muted-foreground">
              Drop here
            </div>
          ) : (
            chapters.map((ch) => (
              <PipelineCard
                key={ch.id}
                chapter={ch}
                onClick={() => onCardClick(ch.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
