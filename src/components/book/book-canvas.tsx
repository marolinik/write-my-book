"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { useReorderChapters } from "@/hooks/use-chapters";
import {
  CanvasChapterCard,
  type CanvasChapter,
} from "./canvas-chapter-card";

interface BookCanvasProps {
  bookId: string;
  initialChapters: CanvasChapter[];
}

export function BookCanvas({ bookId, initialChapters }: BookCanvasProps) {
  const router = useRouter();
  const [chapters, setChapters] = useState(initialChapters);
  const reorderChapters = useReorderChapters(bookId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = chapters.findIndex((c) => c.id === active.id);
      const newIndex = chapters.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(chapters, oldIndex, newIndex);

      // Renumber chapters based on new positions
      const renumbered = reordered.map((ch, i) => ({
        ...ch,
        chapterNumber: i + 1,
      }));
      setChapters(renumbered);

      // Persist the whole new ordering in one atomic request — the endpoint
      // renumbers transactionally, so no per-chapter PATCH race / P2002.
      reorderChapters
        .mutateAsync(
          renumbered.map((ch) => ({
            chapterId: ch.id,
            chapterNumber: ch.chapterNumber,
          }))
        )
        .catch(() => {
          toast.error("Failed to reorder chapters");
          setChapters(initialChapters);
        });
    },
    [chapters, initialChapters, reorderChapters]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={chapters.map((c) => c.id)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {chapters.map((ch) => (
            <CanvasChapterCard
              key={ch.id}
              chapter={ch}
              onClick={() =>
                router.push(`/books/${bookId}/chapters/${ch.id}`)
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
