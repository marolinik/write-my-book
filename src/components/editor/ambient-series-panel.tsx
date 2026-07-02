"use client";

import {
  LibraryIcon,
  RefreshCwIcon,
  Loader2Icon,
  UsersIcon,
  GitBranchIcon,
  ActivityIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAmbientContext } from "@/hooks/use-ambient-context";

// Human-readable labels — never surface the raw camelCase metric key as UI copy (review fix).
const TONE_LABELS: Record<string, string> = {
  avgWordsPerSentence: "Sentence length",
  avgSentencesPerParagraph: "Paragraph length",
};

interface AmbientSeriesPanelProps {
  bookId: string;
  chapterNumber: number | null;
  onClose?: () => void;
}

export function AmbientSeriesPanel({ bookId, chapterNumber, onClose }: AmbientSeriesPanelProps) {
  const { data, isLoading, isError, refetch, isFetching } = useAmbientContext(
    bookId,
    chapterNumber,
    true
  );

  const graphOffline = data?.meta.sourcesAvailable.graph === false;
  const notReady = data?.meta.notReady === true;

  // Standalone book (series:null) → render nothing, never a misleading "graph
  // offline" state. The toolbar toggle is also gated on series membership so this
  // path is normally unreachable, but the panel is defensive (review fix).
  if (data && data.series === null) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LibraryIcon className="size-4" />
          Series context
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh series context">
            {isFetching ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="size-6" onClick={onClose} aria-label="Close series context">
              <XIcon className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2Icon className="size-3 animate-spin" /> Loading series context...
            </div>
          ) : isError ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Couldn&apos;t load series context.</p>
          ) : graphOffline ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Series graph unavailable right now.</p>
          ) : notReady ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Keep writing — series context appears once this chapter&apos;s cast is detected.</p>
          ) : (
            <>
              {/* Characters */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <UsersIcon className="size-3" /> Characters ({data?.characters.length ?? 0})
                </div>
                {data && data.characters.length > 0 ? (
                  data.characters.map((c) => (
                    <div key={`${c.name}-${c.lastBook}`} className="rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.name}</span>
                        <Badge variant="outline" className="text-[9px]">
                          B{c.lastBook}{c.lastChapter != null ? `·Ch${c.lastChapter}` : ""}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {[c.role, c.status].filter(Boolean).join(" · ")}
                      </p>
                      {c.description && <p className="text-[11px] mt-1 italic">{c.description}</p>}
                      {c.matchedFrom && <p className="text-[10px] text-muted-foreground mt-1">matched &ldquo;{c.matchedFrom}&rdquo;</p>}
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground">No prior-book characters on stage here.</p>
                )}
              </section>

              {/* Open threads */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <GitBranchIcon className="size-3" /> Open threads ({data?.threads.length ?? 0})
                </div>
                {data && data.threads.length > 0 ? (
                  data.threads.map((t) => (
                    <div key={`${t.name}-${t.fromBook}`} className="rounded-md border p-2">
                      <span className="text-sm">{t.name}</span>
                      <p className="text-[10px] text-muted-foreground">B{t.fromBook} · {t.status}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground">No open threads touch this chapter.</p>
                )}
              </section>

              {/* Tone drift — advisory only */}
              {data?.toneDrift && data.toneDrift.metrics.some((m) => m.material) && (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <ActivityIcon className="size-3" /> Tone vs Book {data.toneDrift.baselineBook}
                  </div>
                  {data.toneDrift.metrics.filter((m) => m.material).map((m) => (
                    <p key={m.key} className="text-[11px] text-muted-foreground">
                      {TONE_LABELS[m.key] ?? m.key}: {m.deltaPct > 0 ? "▲" : "▼"}{Math.abs(m.deltaPct)}% vs series
                    </p>
                  ))}
                  <p className="text-[10px] text-muted-foreground/70 italic">advisory — not a finding</p>
                </section>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
