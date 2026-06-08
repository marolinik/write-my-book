"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";

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

export interface CanvasChapter {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
  wordCount: number;
  actNumber: number;
}

interface CanvasChapterCardProps {
  chapter: CanvasChapter;
  onClick: () => void;
}

export function CanvasChapterCard({ chapter, onClick }: CanvasChapterCardProps) {
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
      className={`group relative flex flex-col justify-between rounded-md border border-l-4 ${borderClass} bg-card p-2.5 cursor-pointer hover:bg-accent/50 transition-colors select-none ${
        isDragging ? "opacity-50 shadow-lg z-50" : ""
      }`}
      onClick={onClick}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>

      {/* Header: chapter number + act badge */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-mono text-muted-foreground">
          Ch.{chapter.chapterNumber}
        </span>
        <span className="text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground">
          A{chapter.actNumber}
        </span>
      </div>

      {/* Title */}
      <p className="text-xs font-medium leading-tight truncate mb-1.5">
        {chapter.title || (
          <span className="text-muted-foreground italic">Untitled</span>
        )}
      </p>

      {/* Word count */}
      <p className="text-[10px] text-muted-foreground">
        {chapter.wordCount.toLocaleString()} words
      </p>
    </div>
  );
}
