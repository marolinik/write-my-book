"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const STATUS_BORDER_COLORS: Record<string, string> = {
  undiscussed: "border-l-muted-foreground/40",
  discussed: "border-l-blue-400",
  planned: "border-l-indigo-400",
  drafted: "border-l-amber-400",
  dev_edited: "border-l-orange-400",
  line_edited: "border-l-purple-400",
  beta_read: "border-l-pink-400",
  beta_passed: "border-l-green-500",
};

export interface PipelineChapter {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
  wordCount: number;
}

interface PipelineCardProps {
  chapter: PipelineChapter;
  onClick: () => void;
}

export function PipelineCard({ chapter, onClick }: PipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const borderClass = STATUS_BORDER_COLORS[chapter.status] ?? "border-l-muted-foreground/40";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border border-l-4 ${borderClass} bg-card px-2.5 py-2 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors ${
        isDragging ? "opacity-50 shadow-lg z-50" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-mono text-muted-foreground shrink-0">
          Ch.{chapter.chapterNumber}
        </span>
        <p className="text-xs font-medium truncate">
          {chapter.title || (
            <span className="text-muted-foreground italic">Untitled</span>
          )}
        </p>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {chapter.wordCount.toLocaleString()} words
      </p>
    </div>
  );
}
