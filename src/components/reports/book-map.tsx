"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import type { StructureMove } from "@/lib/structure/types";
import { cn } from "@/lib/utils";

/**
 * The book map (dev editor v2, phase C): every chapter on one screen, so the
 * writer sees the shape the developmental editor reasoned over. One bar per
 * row, the chapter's length against the longest, with a tick at the median;
 * everything else is numbers in text ink. The table is its own accessible view.
 */

interface MapChapter {
  chapterId: string;
  chapterNumber: number;
  title: string | null;
  words: number;
  scenes: number;
  dialogueShare: number | null;
  startsAtPct: number;
  flags: string[];
  tension: number | null;
  hook: { opening: number; ending: number; note: string | null } | null;
}

interface BookMapData {
  totalWords: number;
  medianWords: number;
  chapters: MapChapter[];
}

type Strings = Record<string, string>;

/** Chapters a live move acts on, by number. */
function movesByChapter(moves: readonly StructureMove[]): Map<number, StructureMove[]> {
  const out = new Map<number, StructureMove[]>();
  for (const m of moves) {
    const p = m.payload ?? {};
    const numbers = p.chapterNumbers ?? (p.chapterNumber !== undefined ? [p.chapterNumber] : []);
    for (const n of numbers) out.set(n, [...(out.get(n) ?? []), m]);
  }
  return out;
}

export function BookMap({
  bookId,
  moves,
  s,
  kindLabel,
}: {
  bookId: string;
  moves: readonly StructureMove[];
  s: Strings;
  kindLabel: (kind: string) => string;
}) {
  const query = useQuery({
    queryKey: ["structure-book-map", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/structure/book-map`);
      if (!res.ok) throw new Error("book map failed");
      return res.json() as Promise<BookMapData>;
    },
    // Every chapter is read to draw it; a refocus is not a reason to do it again.
    staleTime: 60_000,
  });
  if (query.data && Array.isArray(query.data.chapters) && query.data.chapters.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="book-map-title">
      <div>
        <h3 id="book-map-title" className="text-base font-semibold">{s.bookMap}</h3>
        <p className="text-sm text-muted-foreground">{s.bookMapDesc}</p>
      </div>
      <BookMapBody query={query} moves={moves} s={s} kindLabel={kindLabel} />
    </section>
  );
}

function BookMapBody({
  query,
  moves,
  s,
  kindLabel,
}: {
  query: { isLoading: boolean; isError: boolean; data?: BookMapData };
  moves: readonly StructureMove[];
  s: Strings;
  kindLabel: (kind: string) => string;
}) {
  if (query.isLoading) {
    return <div className="h-40 animate-pulse rounded-md border bg-muted/40" aria-busy="true" />;
  }
  const data = query.data;
  if (query.isError || !data || !Array.isArray(data.chapters)) {
    return <p className="text-sm text-muted-foreground">{s.bookMapError}</p>;
  }
  if (data.chapters.length === 0) return null;

  const longest = Math.max(data.medianWords, ...data.chapters.map((c) => c.words), 1);
  const medianAt = (data.medianWords / longest) * 100;
  const pinned = movesByChapter(moves);

  return (
    <div className="overflow-x-auto rounded-md border" role="region" aria-label={s.bookMap} tabIndex={0}>
      <table className="w-full min-w-[640px] text-sm">
        <caption className="px-3 py-2 text-left text-xs text-muted-foreground">
          {s.medianLabel.replace("{n}", String(data.medianWords))}
        </caption>
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">{s.colChapter}</th>
            <th scope="col" className="w-[34%] px-3 py-2 text-left font-medium">{s.colLength}</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">{s.colScenes}</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">{s.colDialogue}</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">{s.colTension}</th>
            <th scope="col" className="px-2 py-2 text-right font-medium" title={s.hookScale}>{s.colHooks}</th>
            <th scope="col" className="px-3 py-2 text-left font-medium">{s.colMoves}</th>
          </tr>
        </thead>
        <tbody>
          {data.chapters.map((c) => (
            <tr key={c.chapterId} data-chapter={c.chapterNumber} className="border-b last:border-0">
              <td className="max-w-[12rem] px-3 py-1.5">
                <span className="mr-1.5 tabular-nums text-muted-foreground">{c.chapterNumber}</span>
                <span className="inline-block max-w-[9rem] truncate align-bottom" title={c.title ?? undefined}>
                  {c.title}
                </span>
              </td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2" title={`${c.words} / ${data.medianWords}`}>
                  <div className="relative h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                      style={{ width: `${(c.words / longest) * 100}%` }}
                    />
                    <div
                      aria-hidden
                      className="absolute -top-0.5 h-3 w-px bg-foreground/50"
                      style={{ left: `${medianAt}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "w-12 shrink-0 text-right text-xs tabular-nums",
                      c.flags.length > 0 ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {c.words}
                  </span>
                </div>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{c.scenes}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                {c.dialogueShare === null ? "-" : `${Math.round(c.dialogueShare * 100)}%`}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{c.tension ?? "-"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums" title={c.hook?.note ?? s.hookScale}>
                {c.hook ? `${c.hook.opening}/${c.hook.ending}` : "-"}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex flex-wrap gap-1">
                  {(pinned.get(c.chapterNumber) ?? []).map((m) => (
                    <Badge key={m.id} variant="outline" className="px-1.5 py-0 text-[10px]">
                      {kindLabel(m.kind)}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
