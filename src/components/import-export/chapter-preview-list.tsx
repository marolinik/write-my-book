"use client";

import { countWithNoun } from "@/lib/i18n/plural";
import { useLanguage } from "@/components/providers/language-provider";
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
import {
  occupiedChapters,
  type ExistingChapterSummary,
  type ImportAction,
} from "@/lib/import-export/import-conflicts";

export interface PreviewChapter {
  tempId: string;
  number: number;
  title: string;
  content: string;
  wordCount: number;
  sourceFile: string;
  /** Only meaningful when the row lands on an existing chapter (P6-S04). */
  action?: ImportAction;
  /** P6-S02: text from before the first chapter heading, kept as a chapter. */
  beforeFirstHeading?: boolean;
}

interface ChapterPreviewListProps {
  chapters: PreviewChapter[];
  onChange: (chapters: PreviewChapter[]) => void;
  existingChapters?: ExistingChapterSummary[];
}

/** Highest chapter number the import accepts (importConfirmChapterSchema). */
const MAX_CHAPTER_NUMBER = 999;

/**
 * Number the rows `start`, `start + 1`, … in list order. A row's answer to
 * "replace or skip?" was given for one existing chapter, so it is dropped when
 * the row moves to a different number — it must never follow the row onto a
 * chapter the writer did not look at.
 */
function renumber(chapters: PreviewChapter[], start: number): PreviewChapter[] {
  return chapters.map((ch, i) =>
    ch.number === start + i ? ch : { ...ch, number: start + i, action: undefined }
  );
}

export function ChapterPreviewList({
  chapters,
  onChange,
  existingChapters,
}: ChapterPreviewListProps) {
  const { t, language } = useLanguage();
  const locale = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [firstNumberDraft, setFirstNumberDraft] = useState<string | null>(null);

  // P6-S04: rows are numbered from here, contiguously, so a partial re-import
  // can be aimed at the chapters it revises instead of always at 1, 2, …
  const firstNumber = chapters[0]?.number ?? 1;
  const occupied = occupiedChapters(existingChapters ?? []);
  const conflicting = chapters.filter((ch) => occupied.has(ch.number));

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
      onChange(renumber(arrayMove(chapters, oldIndex, newIndex), firstNumber));
    },
    [chapters, onChange, firstNumber]
  );

  const handleFirstNumberChange = useCallback(
    (raw: string) => {
      setFirstNumberDraft(raw);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      const highest = Math.max(1, MAX_CHAPTER_NUMBER - (chapters.length - 1));
      onChange(renumber(chapters, Math.min(Math.max(parsed, 1), highest)));
    },
    [chapters, onChange]
  );

  const handleDecide = useCallback(
    (tempId: string, action: ImportAction) => {
      onChange(chapters.map((ch) => (ch.tempId === tempId ? { ...ch, action } : ch)));
    },
    [chapters, onChange]
  );

  const handleDecideAll = useCallback(
    (action: ImportAction) => {
      onChange(chapters.map((ch) => (occupied.has(ch.number) ? { ...ch, action } : ch)));
    },
    [chapters, onChange, occupied]
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
      onChange(renumber(chapters.filter((ch) => ch.tempId !== tempId), firstNumber));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
    },
    [chapters, onChange, firstNumber]
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
      title: `${firstSelected.title} ${t.importExportUI.mergedSuffix}`,
      content: mergedContent,
      wordCount: mergedWordCount,
      sourceFile: firstSelected.sourceFile,
    };

    const remaining = chapters.filter((ch) => !selected.has(ch.tempId));
    const insertIdx = chapters.findIndex((ch) => ch.tempId === firstSelected.tempId);
    remaining.splice(insertIdx, 0, merged);

    onChange(renumber(remaining, firstNumber));
    setSelected(new Set());
  }, [chapters, selected, onChange, firstNumber]);

  const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {t.importExportUI.chaptersDetected.replace(
            "{countNoun}",
            countWithNoun(chapters.length, t.setup.chapterOne, t.setup.chapterMany, {
              few: t.setup.chapterFew,
              language,
            })
          )}
        </span>
        <div className="flex items-center gap-2">
          {selected.size >= 2 && (
            <Button variant="outline" size="sm" onClick={handleMerge}>
              <MergeIcon className="mr-1 size-3" />
              {t.importExportUI.mergeSelected.replace(
                "{count}",
                String(selected.size)
              )}
            </Button>
          )}
          <Badge variant="secondary">
            {t.importExportUI.wordsCount.replace(
              "{count}",
              totalWordCount.toLocaleString(locale)
            )}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <label htmlFor="import-number-from" className="text-muted-foreground">
          {t.importExportUI.numberFrom}
        </label>
        <Input
          id="import-number-from"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_CHAPTER_NUMBER}
          className="h-7 w-20 text-sm"
          value={firstNumberDraft ?? String(firstNumber)}
          onChange={(e) => handleFirstNumberChange(e.target.value)}
          onBlur={() => setFirstNumberDraft(null)}
        />
      </div>

      {occupied.size > 0 && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-300">
          <p>
            {t.importExportUI.existingChaptersHint.replace(
              "{countNoun}",
              countWithNoun(
                occupied.size,
                t.setup.chapterOne,
                t.setup.chapterMany,
                { few: t.setup.chapterFew, language }
              )
            )}
          </p>
          {conflicting.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handleDecideAll("replace")}
              >
                {t.importExportUI.replaceAll}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handleDecideAll("skip")}
              >
                {t.importExportUI.skipAll}
              </Button>
            </div>
          )}
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
                conflict={occupied.get(ch.number)}
                isSelected={selected.has(ch.tempId)}
                onToggleSelect={handleToggleSelect}
                onRename={handleRename}
                onRemove={handleRemove}
                onDecide={handleDecide}
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
  conflict,
  isSelected,
  onToggleSelect,
  onRename,
  onRemove,
  onDecide,
}: {
  chapter: PreviewChapter;
  /** The writer's existing chapter at this row's number, if any (P6-S04). */
  conflict?: ExistingChapterSummary;
  isSelected: boolean;
  onToggleSelect: (tempId: string, checked: boolean) => void;
  onRename: (tempId: string, title: string) => void;
  onRemove: (tempId: string) => void;
  onDecide: (tempId: string, action: ImportAction) => void;
}) {
  const { t } = useLanguage();
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
  const skipped = conflict !== undefined && chapter.action === "skip";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`space-y-1.5 rounded-md border bg-card p-2 ${skipped ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2">
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
          aria-label={t.appUI.dragToReorder}
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
            title={t.appUI.clickToRename}
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

      {chapter.beforeFirstHeading && (
        <p className="pl-8 text-xs text-muted-foreground">
          {t.importExportUI.beforeFirstHeading}
        </p>
      )}

      {conflict && (
        <div className="flex flex-wrap items-center gap-2 pl-8 text-xs">
          <span
            className={
              chapter.action
                ? "text-muted-foreground"
                : "text-amber-700 dark:text-amber-300"
            }
          >
            {/* The writer's title goes in last, so no placeholder inside it is expanded. */}
            {t.importExportUI.conflictExisting
              .replace("{number}", String(conflict.number))
              .replace(
                "{words}",
                t.importExportUI.wordsCount.replace(
                  "{count}",
                  conflict.wordCount.toLocaleString(locale)
                )
              )
              .replace("{title}", conflict.title?.trim() || t.bookOverview.untitled)}
          </span>
          <div className="flex gap-1">
            <Button
              variant={chapter.action === "replace" ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-xs"
              aria-pressed={chapter.action === "replace"}
              onClick={() => onDecide(chapter.tempId, "replace")}
            >
              {t.importExportUI.actionReplace}
            </Button>
            <Button
              variant={chapter.action === "skip" ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-xs"
              aria-pressed={chapter.action === "skip"}
              onClick={() => onDecide(chapter.tempId, "skip")}
            >
              {t.importExportUI.actionSkip}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
