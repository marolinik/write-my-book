"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Replace, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isWordLikeQuery } from "@/lib/search/find-replace";
import { useBookSearch, useBookReplace, type SearchHit } from "@/hooks/use-find-replace";

interface FindReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  /** The chapter currently open in the editor — target for "This chapter". */
  chapterId: string;
}

type Scope = "chapter" | "book";

const DEBOUNCE_MS = 300;

/**
 * Find & Replace across a chapter or the whole book. Live (debounced) search
 * preview; Replace-all runs server-side and the editor reloads via the shared
 * ["chapter-content", bookId] invalidation. Plain-text only (no regex).
 */
export function FindReplaceDialog({
  open,
  onOpenChange,
  bookId,
  chapterId,
}: FindReplaceDialogProps) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [scope, setScope] = useState<Scope>("chapter");
  const [caseSensitive, setCaseSensitive] = useState(false);
  // D-189: whole-word matching, ON by default. The job this dialog exists for
  // is a book-wide character rename; substring matching turned `Sam` → `Max`
  // into `Maxe`/`Maxple`/`Maxovar` across a finished manuscript and reported
  // the corruptions as successes.
  const [wholeWord, setWholeWord] = useState(true);
  const [debouncedFind, setDebouncedFind] = useState("");

  // Reset transient input when the dialog is dismissed.
  useEffect(() => {
    if (!open) {
      setFind("");
      setReplace("");
      setDebouncedFind("");
    }
  }, [open]);

  // Debounce the search term so keystrokes don't hammer the route.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFind(find), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [find]);

  // A term that does not start AND end with a word character can never satisfy
  // the boundary rule, so whole word is not offered for it (an empty box keeps
  // the toggle live — there is nothing to contradict yet).
  const wholeWordApplies = find.trim().length === 0 || isWordLikeQuery(find);
  const effectiveWholeWord = wholeWord && wholeWordApplies;

  const search = useBookSearch(
    bookId,
    debouncedFind,
    caseSensitive,
    effectiveWholeWord,
    open
  );
  const replaceMutation = useBookReplace(bookId);

  // "This chapter" filters the book-wide result to the open chapter.
  const visibleHits: SearchHit[] = useMemo(() => {
    const hits = search.data?.hits ?? [];
    return scope === "chapter"
      ? hits.filter((hit) => hit.chapterId === chapterId)
      : hits;
  }, [search.data, scope, chapterId]);

  const visibleCount = useMemo(
    () => visibleHits.reduce((sum, hit) => sum + hit.count, 0),
    [visibleHits]
  );

  const canReplace =
    find.trim().length >= 2 && visibleCount > 0 && !replaceMutation.isPending;

  const handleReplaceAll = async () => {
    if (find.trim().length < 2) return;
    try {
      const res = await replaceMutation.mutateAsync({
        find,
        replace,
        chapterIds: scope === "chapter" ? [chapterId] : undefined,
        caseSensitive,
        wholeWord: effectiveWholeWord,
      });
      if (res.totalReplacements === 0) {
        toast.info("No matches replaced.");
        return;
      }
      const chapterWord = res.replaced.length === 1 ? "chapter" : "chapters";
      toast.success(
        `Replaced ${res.totalReplacements} ${
          res.totalReplacements === 1 ? "occurrence" : "occurrences"
        } across ${res.replaced.length} ${chapterWord}.`
      );
      onOpenChange(false);
    } catch (error) {
      toast.error("Replace failed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const showPreview = debouncedFind.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Find &amp; Replace</DialogTitle>
          <DialogDescription>
            Search this chapter or the whole book. Matching is plain text — no
            wildcards or regular expressions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="fr-find">Find</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="fr-find"
                value={find}
                autoFocus
                onChange={(e) => setFind(e.target.value)}
                placeholder="Text to find (min 2 characters)"
                className="pl-8"
                maxLength={200}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fr-replace">Replace with</Label>
            <div className="relative">
              <Replace className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="fr-replace"
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder="Replacement text (leave empty to delete)"
                className="pl-8"
                maxLength={200}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Scope — segmented control (no RadioGroup primitive in this repo) */}
            <div
              role="radiogroup"
              aria-label="Search scope"
              className="inline-flex rounded-md border p-0.5"
            >
              {(
                [
                  { value: "chapter", label: "This chapter" },
                  { value: "book", label: "Whole book" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={scope === opt.value}
                  onClick={() => setScope(opt.value)}
                  className={cn(
                    "rounded px-3 py-1 text-sm transition-colors",
                    scope === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="fr-whole-word"
                  checked={effectiveWholeWord}
                  disabled={!wholeWordApplies}
                  onCheckedChange={setWholeWord}
                />
                <Label htmlFor="fr-whole-word" className="text-sm font-normal">
                  Whole word
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="fr-case"
                  checked={caseSensitive}
                  onCheckedChange={setCaseSensitive}
                />
                <Label htmlFor="fr-case" className="text-sm font-normal">
                  Case sensitive
                </Label>
              </div>
            </div>
          </div>

          {!wholeWordApplies && (
            <p className="text-xs text-muted-foreground">
              Whole word needs a search term that starts and ends with a letter,
              digit or underscore — it is off for this one.
            </p>
          )}

          {/* Live preview */}
          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-sm text-muted-foreground">
              {!showPreview ? (
                "Type at least 2 characters to preview matches."
              ) : search.isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </span>
              ) : search.isError ? (
                <span className="text-destructive">Search failed.</span>
              ) : visibleCount === 0 ? (
                "No matches found."
              ) : (
                `${visibleCount} ${
                  visibleCount === 1 ? "match" : "matches"
                } in ${visibleHits.length} ${
                  visibleHits.length === 1 ? "chapter" : "chapters"
                }`
              )}
            </div>
            {showPreview && visibleHits.length > 0 && (
              <ScrollArea className="max-h-56">
                <ul className="divide-y">
                  {visibleHits.map((hit) => (
                    <li key={hit.chapterId} className="px-3 py-2">
                      <div className="mb-1 text-sm font-medium">
                        Ch. {hit.chapterNumber}
                        {hit.title ? ` — ${hit.title}` : ""}{" "}
                        <span className="text-muted-foreground">
                          ({hit.count})
                        </span>
                      </div>
                      <div className="space-y-1">
                        {hit.snippets.map((s, i) => (
                          <p
                            key={i}
                            className="truncate font-mono text-xs text-muted-foreground"
                          >
                            …{s.before}
                            <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-800/60">
                              {s.match}
                            </mark>
                            {s.after}…
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={replaceMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleReplaceAll} disabled={!canReplace}>
            {replaceMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Replace all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
