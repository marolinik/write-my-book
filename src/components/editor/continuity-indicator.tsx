"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScanFlag } from "@/hooks/use-continuity-scan";
import { useLanguage } from "@/components/providers/language-provider";

interface ContinuityIndicatorProps {
  flags: ScanFlag[];
  currentChapter: number | null;
  scanning: boolean;
}

/** Quiet live-continuity status: silent when clean; a count (with "here/elsewhere"
 *  split) when contradictions exist. */
export function ContinuityIndicator({ flags, currentChapter, scanning }: ContinuityIndicatorProps) {
  const { t } = useLanguage();
  if (scanning && flags.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />{t.editorChrome.checking}</span>
    );
  }
  if (flags.length === 0) return null;
  const here = flags.filter((f) => f.chapterNumber === currentChapter).length;
  const count = (template: string, value: number) => template.replace("{count}", String(value));
  const label =
    here > 0
      ? count(t.editorChrome.continuityHere, here) +
        (flags.length > here
          ? ` · ${count(t.editorChrome.continuityElsewhere, flags.length - here)}`
          : "")
      : count(t.editorChrome.continuityFlags, flags.length);
  return (
    <Badge variant="outline" className="gap-1 text-[10px] text-orange-600 border-orange-300">
      <AlertTriangleIcon className="size-3" /> {label}
    </Badge>
  );
}
