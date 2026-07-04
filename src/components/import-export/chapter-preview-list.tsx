"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GripVerticalIcon,
  Trash2Icon,
  SplitIcon,
  MergeIcon,
} from "lucide-react";
import { useLocale } from "@/components/providers/language-provider";

export interface PreviewChapter {
  tempId: string;
  number: number;
  title: string;
  content: string;
  wordCount: number;
  sourceFile: string;
  action?: "create" | "replace" | "skip";
}

interface ChapterPreviewListProps {
  chapters: PreviewChapter[];
  onChange: (chapters: PreviewChapter[]) => void;
  existingChapters?: Array<{ number: number; title: string | null; wordCount: number }>;
}

export function ChapterPreviewList({
  chapters,
  onChange,
  existingChapters,
}: ChapterPreviewListProps) {
  const locale = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = chapters.findIndex((c) => c.tempId === active.id);
      const newIndex = chapters.findIndex((c) => c.tempId === over.id);
      const reordered = arrayMove(chapters, oldIndex, newIndex).map(
        (ch, i) => ({ ...ch, number: i + 1 })
      );
      onChange(reordered);
    },
    [chapters, onChange]
  );

  const handleRename = useCallback(
    (tempId: string, newTitle: string) => {
      onChange(
        chapters.map((ch) =>
          ch.tempId === tempId ? { ...ch, title: newTitle } : ch
        )
      );
    },
    [chapters, onChange]
  );

  const handleRemove = useCallback(
    (tempId: string) => {
      const filtered = chapters
        .filter((ch) => ch.tempId !== tempId)
        .map((ch, i) => ({ ...ch, number: i + 1 }));
      onChange(filtered);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
    },
    [chapters, onChange]
  );

  const handleToggleSelect = useCallback((tempId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(tempId);
      else next.delete(tempId);
      return next;
    });
  }, []);

  const handleMerge = useCallback(() => {
    if (selected.size < 2) return;
    const selectedChapters = chapters.filter((ch) => selected.has(ch.tempId));
    const mergedContent = selectedChapters.map((ch) => ch.content).join("\n\n");
    const mergedWordCount = selectedChapters.reduce((s, ch) => s + ch.wordCount, 0);
    const firstSelected = selectedChapters[0];

    const merged: PreviewChapter = {
      tempId: `merged-${Date.now()}`,
      number: firstSelected.number,
      title: `${firstSelected.title} (merged)`,
      content: mergedContent,
      wordCount: mergedWordCount,
      sourceFile: firstSelected.sourceFile,
    };

    const remaining = chapters.filter((ch) => !selected.has(ch.tempId));
    const insertIdx = chapters.findIndex((ch) => ch.tempId === firstSelected.tempId);
    remaining.splice(insertIdx, 0, merged);

    const renumbered = remaining.map((ch, i) => ({ ...ch, number: i + 1 }));
    onChange(renumbered);
    setSelected(new Set());
  }, [chapters, selected, onChange]);

  const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {chapters.length} chapter{chapters.length !== 1 ? "s" : ""} detected
        </span>
        <div className="flex items-center gap-2">
          {selected.size >= 2 && (
            <Button variant="outline" size="sm" onClick={handleMerge}>
              <MergeIcon className="mr-1 size-3" />
              Merge {selected.size}
            </Button>
          )}
          <Badge variant="secondary">
            {totalWordCount.toLocaleString(locale)} words
          </Badge>
        </div>
      </div>

      {existingChapters && existingChapters.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-300">
          This book has {existingChapters.length} existing chapter{existingChapters.length !== 1 ? "s" : ""}.
          Chapters with matching numbers will be available for replacement.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={chapters.map((ch) => ch.tempId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {chapters.map((ch) => (
              <SortableChapterRow
                key={ch.tempId}
                chapter={ch}
                isSelected={selected.has(ch.tempId)}
                onToggleSelect={handleToggleSelect}
                onRename={handleRename}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableChapterRow({
  chapter,
  isSelected,
  onToggleSelect,
  onRename,
  onRemove,
}: {
  chapter: PreviewChapter;
  isSelected: boolean;
  onToggleSelect: (tempId: string, checked: boolean) => void;
  onRename: (tempId: string, title: string) => void;
  onRemove: (tempId: string) => void;
}) {
  const locale = useLocale();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.tempId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isEditing, setIsEditing] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-card p-2"
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onToggleSelect(chapter.tempId, e.target.checked)}
        className="size-4 rounded border-input accent-primary shrink-0"
      />
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="text-xs font-mono text-muted-foreground w-6 text-right shrink-0">
        {chapter.number}
      </span>
      {isEditing ? (
        <Input
          autoFocus
          defaultValue={chapter.title}
          className="h-7 text-sm flex-1"
          onBlur={(e) => {
            onRename(chapter.tempId, e.target.value);
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(chapter.tempId, e.currentTarget.value);
              setIsEditing(false);
            }
          }}
        />
      ) : (
        <button
          className="text-sm text-left flex-1 truncate hover:underline"
          onClick={() => setIsEditing(true)}
          title="Click to rename"
        >
          {chapter.title}
        </button>
      )}
      <Badge variant="outline" className="text-[10px] shrink-0">
        {chapter.sourceFile}
      </Badge>
      <span className="text-xs text-muted-foreground shrink-0">
        {chapter.wordCount.toLocaleString(locale)} w
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="size-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onRemove(chapter.tempId)}
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  );
}
