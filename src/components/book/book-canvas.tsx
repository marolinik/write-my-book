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
import { useUpdateAnyChapter } from "@/hooks/use-chapters";
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
  const updateChapter = useUpdateAnyChapter(bookId);

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

      // Persist changes for affected chapters
      const moved = renumbered.filter((ch, i) => {
        const original = chapters.find((c) => c.id === ch.id);
        return original && original.chapterNumber !== ch.chapterNumber;
      });

      Promise.all(
        moved.map((ch) =>
          updateChapter.mutateAsync({
            chapterId: ch.id,
            data: { chapterNumber: ch.chapterNumber },
          })
        )
      ).catch(() => {
        toast.error("Failed to reorder chapters");
        setChapters(initialChapters);
      });
    },
    [chapters, initialChapters, updateChapter]
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
