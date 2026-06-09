"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SplitChapterPickerProps {
  chapters: Array<{ id: string; chapterNumber: number; title: string | null }>;
  excludeChapterId: string;
  value: string | null;
  onChange: (chapterId: string) => void;
}

export function SplitChapterPicker({
  chapters,
  excludeChapterId,
  value,
  onChange,
}: SplitChapterPickerProps) {
  const available = chapters.filter((ch) => ch.id !== excludeChapterId);

  return (
    <div className="border-b px-3 py-1.5 bg-muted/20">
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Select chapter..." />
        </SelectTrigger>
        <SelectContent>
          {available.map((ch) => (
            <SelectItem key={ch.id} value={ch.id}>
              Ch.{ch.chapterNumber}
              {ch.title ? `: ${ch.title}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
