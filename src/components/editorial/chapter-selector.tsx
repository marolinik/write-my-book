"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditorialStore } from "@/stores/editorial-store";

interface ChapterSelectorProps {
  chapters: Array<{
    id: string;
    chapterNumber: number;
    title: string | null;
    status: string;
  }>;
}

export function ChapterSelector({ chapters }: ChapterSelectorProps) {
  const { selectedChapter, setSelectedChapter } = useEditorialStore();

  return (
    <Select
      value={selectedChapter !== null ? String(selectedChapter) : "all"}
      onValueChange={(v) =>
        setSelectedChapter(v === "all" ? null : Number(v))
      }
    >
      <SelectTrigger className="w-[220px] h-8 text-xs">
        <SelectValue placeholder="All chapters" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All chapters</SelectItem>
        {chapters.map((ch) => (
          <SelectItem key={ch.id} value={String(ch.chapterNumber)}>
            <span className="flex items-center gap-2">
              Ch. {ch.chapterNumber}: {ch.title ?? "Untitled"}
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {ch.status}
              </Badge>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
