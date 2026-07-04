"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  GripVerticalIcon,
  CircleIcon,
  PenLineIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { fetchJson } from "@/lib/api-client";
import { useLocale } from "@/components/providers/language-provider";

/**
 * Gap 2: Drag-and-Drop Corkboard View
 * Scrivener-style index card layout for visual chapter reorganization.
 * Each card shows: chapter number, title, status, word count, synopsis.
 * Drag to reorder chapters.
 */

interface CorkboardChapter {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
  wordCount: number;
  actNumber: number;
  betaScore: number | null;
}

interface CorkboardViewProps {
  bookId: string;
  chapters: CorkboardChapter[];
  onReorder?: (reorderedIds: string[]) => void;
}

const STATUS_COLORS: Record<string, string> = {
  undiscussed: "bg-muted-foreground/20",
  discussed: "bg-blue-400",
  planned: "bg-indigo-400",
  drafted: "bg-amber-400",
  dev_edited: "bg-orange-400",
  line_edited: "bg-purple-400",
  beta_read: "bg-pink-400",
  beta_passed: "bg-green-500",
};

const STATUS_LABELS: Record<string, string> = {
  undiscussed: "New",
  discussed: "Discussed",
  planned: "Planned",
  drafted: "Drafted",
  dev_edited: "Dev Edited",
  line_edited: "Line Edited",
  beta_read: "Beta Read",
  beta_passed: "Passed",
};

export function CorkboardView({ bookId, chapters: initialChapters, onReorder }: CorkboardViewProps) {
  const locale = useLocale();
  const [chapters, setChapters] = useState(initialChapters);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) {
      setDropTargetId(id);
    }
  }, [draggedId]);

  const handleDrop = useCallback(async (targetId: string) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDropTargetId(null);
      return;
    }

    const oldIndex = chapters.findIndex((c) => c.id === draggedId);
    const newIndex = chapters.findIndex((c) => c.id === targetId);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder locally
    const newChapters = [...chapters];
    const [moved] = newChapters.splice(oldIndex, 1);
    newChapters.splice(newIndex, 0, moved);

    // Update chapter numbers
    const renumbered = newChapters.map((ch, i) => ({
      ...ch,
      chapterNumber: i + 1,
    }));

    setChapters(renumbered);
    setDraggedId(null);
    setDropTargetId(null);

    // Persist to API
    try {
      await fetchJson(`/api/books/${bookId}/chapters/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: renumbered.map((c) => ({
            chapterId: c.id,
            chapterNumber: c.chapterNumber,
          })),
        }),
      });
      toast.success("Chapters reordered");
      onReorder?.(renumbered.map((c) => c.id));
    } catch (err) {
      toast.error("Failed to reorder chapters");
      setChapters(initialChapters); // Rollback
    }
  }, [draggedId, chapters, bookId, initialChapters, onReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {chapters.map((ch) => {
        const isDragging = ch.id === draggedId;
        const isDropTarget = ch.id === dropTargetId;

        return (
          <Card
            key={ch.id}
            draggable
            onDragStart={() => handleDragStart(ch.id)}
            onDragOver={(e) => handleDragOver(e, ch.id)}
            onDrop={() => handleDrop(ch.id)}
            onDragEnd={handleDragEnd}
            className={`cursor-grab active:cursor-grabbing transition-all duration-200 group ${
              isDragging ? "opacity-30 scale-95" : ""
            } ${
              isDropTarget
                ? "ring-2 ring-primary ring-offset-2 scale-105"
                : ""
            } hover:shadow-md`}
          >
            <CardContent className="p-3 space-y-2">
              {/* Header: drag handle + chapter number */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <GripVerticalIcon className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  <span className="text-xs font-medium">
                    Ch. {ch.chapterNumber}
                  </span>
                </div>
                <div
                  className={`size-2 rounded-full ${STATUS_COLORS[ch.status] ?? "bg-muted"}`}
                  title={STATUS_LABELS[ch.status] ?? ch.status}
                />
              </div>

              {/* Title */}
              <Link
                href={`/books/${bookId}/chapters/${ch.id}`}
                className="block text-sm font-medium line-clamp-2 hover:text-primary transition-colors min-h-[2.5rem]"
              >
                {ch.title || `Chapter ${ch.chapterNumber}`}
              </Link>

              {/* Footer: word count + status */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{ch.wordCount.toLocaleString(locale)} words</span>
                <Badge variant="outline" className="text-[8px] px-1 py-0 capitalize">
                  {STATUS_LABELS[ch.status] ?? ch.status}
                </Badge>
              </div>

              {/* Beta score if exists */}
              {ch.betaScore != null && (
                <div className="text-[10px] text-muted-foreground">
                  β {ch.betaScore.toFixed(1)}/10
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
