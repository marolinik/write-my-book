"use client";

import { useCallback, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { useUpdateAnyChapter } from "@/hooks/use-chapters";
import { getStatusLabel } from "@/lib/i18n/ui-strings";
import { PipelineColumn } from "./pipeline-column";
import type { PipelineChapter } from "./pipeline-card";

const PIPELINE_STAGES = [
  "undiscussed",
  "discussed",
  "planned",
  "drafted",
  "dev_edited",
  "line_edited",
  "beta_read",
  "beta_passed",
] as const;

interface ChapterPipelineProps {
  bookId: string;
  initialChapters: PipelineChapter[];
  language?: string;
}

export function ChapterPipeline({ bookId, initialChapters, language = "en" }: ChapterPipelineProps) {
  const router = useRouter();
  const [chapters, setChapters] = useState(initialChapters);
  const [activeId, setActiveId] = useState<string | null>(null);
  const updateChapter = useUpdateAnyChapter(bookId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const columnChapters = useMemo(() => {
    const map: Record<string, PipelineChapter[]> = {};
    for (const stage of PIPELINE_STAGES) {
      map[stage] = chapters
        .filter((ch) => ch.status === stage)
        .sort((a, b) => a.chapterNumber - b.chapterNumber);
    }
    return map;
  }, [chapters]);

  const activeChapter = activeId
    ? chapters.find((c) => c.id === activeId)
    : null;

  // Find which column a chapter belongs to
  const findContainer = (id: string): string | undefined => {
    // Check if id is a stage name (droppable container)
    if (PIPELINE_STAGES.includes(id as typeof PIPELINE_STAGES[number])) {
      return id;
    }
    // Otherwise find the chapter's status
    const ch = chapters.find((c) => c.id === id);
    return ch?.status;
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeContainer = findContainer(active.id as string);
      const overContainer = findContainer(over.id as string);

      if (!activeContainer || !overContainer || activeContainer === overContainer) return;

      // Move chapter to new column optimistically
      setChapters((prev) =>
        prev.map((ch) =>
          ch.id === active.id ? { ...ch, status: overContainer } : ch
        )
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapters]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event;
      setActiveId(null);

      const chapter = chapters.find((c) => c.id === active.id);
      const original = initialChapters.find((c) => c.id === active.id);

      if (!chapter || !original) return;

      // Only persist if status actually changed
      if (chapter.status !== original.status) {
        updateChapter
          .mutateAsync({
            chapterId: chapter.id,
            data: { status: chapter.status },
          })
          .catch(() => {
            toast.error("Failed to update chapter status");
            setChapters(initialChapters);
          });
      }
    },
    [chapters, initialChapters, updateChapter]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setChapters(initialChapters);
  }, [initialChapters]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-2 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineColumn
            key={stage}
            stage={stage}
            label={getStatusLabel(stage, language)}
            chapters={columnChapters[stage]}
            onCardClick={(chapterId) =>
              router.push(`/books/${bookId}/chapters/${chapterId}`)
            }
          />
        ))}
      </div>
      <DragOverlay>
        {activeChapter ? (
          <div className="rounded-md border border-l-4 border-l-primary bg-card px-2.5 py-2 shadow-lg">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-mono text-muted-foreground">
                Ch.{activeChapter.chapterNumber}
              </span>
              <p className="text-xs font-medium truncate">
                {activeChapter.title || "Untitled"}
              </p>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
