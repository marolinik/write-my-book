"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateChapter } from "@/hooks/use-chapters";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { parseWordTargetInput } from "@/lib/word-target";

interface WordTargetPopoverProps {
  bookId: string;
  chapterId: string;
  wordCount: number;
  targetWordCount: number | null;
  language?: string;
}

/**
 * S13: the word-count readout in the chapter header, made clickable.
 * Opens a small popover to set / edit / clear the chapter's word target,
 * persisted via the existing chapter PATCH.
 */
export function WordTargetPopover({
  bookId,
  chapterId,
  wordCount,
  targetWordCount,
  language = "en",
}: WordTargetPopoverProps) {
  const t = getUIStrings(language);
  const locale = localeFor(language);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const updateChapter = useUpdateChapter(bookId, chapterId);

  const parsed = parseWordTargetInput(draft);
  const canSave = parsed !== undefined && !updateChapter.isPending;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Seed the draft from the current target on every open (immutable state,
    // no stale carry-over between chapters).
    if (next) setDraft(targetWordCount != null ? String(targetWordCount) : "");
  };

  const submit = (value: number | null) => {
    updateChapter.mutate(
      { targetWordCount: value },
      {
        onSuccess: () => setOpen(false),
        onError: (error) =>
          toast.error("Failed to save word target", {
            description: (error as Error).message,
          }),
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t.wordTarget.setTarget}
          aria-label={t.wordTarget.setTarget}
          className="tabular-nums cursor-pointer rounded-sm hover:text-foreground hover:underline decoration-dotted underline-offset-2"
        >
          {wordCount.toLocaleString(locale)}
          {targetWordCount
            ? ` / ${targetWordCount.toLocaleString(locale)}`
            : ""}
          {` ${t.wordTarget.words}`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-3">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed !== undefined) submit(parsed);
          }}
        >
          <p className="text-xs font-medium">{t.wordTarget.popoverTitle}</p>
          <Input
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.wordTarget.placeholder}
            className="h-8 text-sm"
          />
          <div className="flex justify-end gap-2">
            {targetWordCount != null && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={updateChapter.isPending}
                onClick={() => submit(null)}
              >
                {t.wordTarget.clear}
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs"
              disabled={!canSave}
            >
              {t.common.save}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
