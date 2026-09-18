"use client";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/providers/language-provider";
import { useLocale } from "@/components/providers/language-provider";

interface SeriesBook {
  id: string;
  name: string;
  bookNumber: number;
  chapterCount: number;
  wordCount: number;
}

/**
 * Structure across the volumes.
 *
 * A structural move belongs to one book — chapters do not travel between
 * volumes, and the engine has no way to move them there. What a series CAN say
 * is how the work is distributed: which volume carries the most chapters, which
 * has the longest ones, and where the shape of one book is out of step with its
 * siblings. Each row opens that book's own structure panel, which is where a
 * move is actually decided (S3-17).
 */
export function SeriesStructurePanel({ books }: { books: SeriesBook[] }) {
  const { t } = useLanguage();
  const locale = useLocale();
  const s = t.bookUI;

  const ordered = [...books].sort((a, b) => a.bookNumber - b.bookNumber);
  const maxChapters = Math.max(1, ...ordered.map((b) => b.chapterCount));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{s.seriesTabStructure}</CardTitle>
        <p className="text-sm text-muted-foreground">{s.seriesStructureWhat}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {ordered.map((book) => {
          // Median is not available per chapter here, so this is the mean —
          // named honestly rather than labelled "median" and quietly wrong.
          const perChapter =
            book.chapterCount > 0
              ? Math.round(book.wordCount / book.chapterCount)
              : 0;

          return (
            <Link
              key={book.id}
              href={`/books/${book.id}/reports?tab=structure`}
              className="block rounded-md border p-3 transition-colors hover:border-primary/50"
              title={s.seriesOpenStructure}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">
                  {book.bookNumber}. {book.name}
                </span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {book.chapterCount} {s.seriesChapters}
                </Badge>
              </div>

              {/* The bar is the comparison: one glance says which volume is
                  carrying more than its share. */}
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary/60"
                  style={{ width: `${(book.chapterCount / maxChapters) * 100}%` }}
                />
              </div>

              <p className="mt-1.5 text-xs text-muted-foreground">
                {book.wordCount.toLocaleString(locale)} · {perChapter.toLocaleString(locale)}{" "}
                / {s.seriesChapters}
              </p>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
