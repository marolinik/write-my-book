"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScanFlag } from "@/hooks/use-continuity-scan";

interface ContinuityIndicatorProps {
  flags: ScanFlag[];
  currentChapter: number | null;
  scanning: boolean;
}

/** Quiet live-continuity status: silent when clean; a count (with "here/elsewhere"
 *  split) when contradictions exist. */
export function ContinuityIndicator({ flags, currentChapter, scanning }: ContinuityIndicatorProps) {
  if (scanning && flags.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" /> checking…
      </span>
    );
  }
  if (flags.length === 0) return null;
  const here = flags.filter((f) => f.chapterNumber === currentChapter).length;
  const label = here > 0 ? `${here} here` + (flags.length > here ? ` · ${flags.length - here} elsewhere` : "") : `${flags.length} continuity`;
  return (
    <Badge variant="outline" className="gap-1 text-[10px] text-orange-600 border-orange-300">
      <AlertTriangleIcon className="size-3" /> {label}
    </Badge>
  );
}
