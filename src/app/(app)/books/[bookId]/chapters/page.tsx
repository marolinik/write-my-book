"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PlusIcon, FileTextIcon } from "lucide-react";

import { useChapters } from "@/hooks/use-chapters";
import { useLanguage, useLocale } from "@/components/providers/language-provider";
import { getStatusLabel } from "@/lib/i18n/ui-strings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** Badge variant per chapter status — mirrors the book-overview list view. */
const STATUS_COLORS: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  undiscussed: "outline",
  discussed: "outline",
  planned: "secondary",
  drafted: "secondary",
  dev_edited: "default",
  line_edited: "default",
  beta_read: "default",
  beta_passed: "default",
};

/**
 * Browsable chapter index for a book (F11). A focused UI page: it lists every
 * chapter from `useChapters` — number, title (or an "Untitled" fallback),
 * localized status, and word count — each row linking to the chapter editor,
 * with loading, error, and empty states plus a "New chapter" action.
 */
export default function ChaptersIndexPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { t, language } = useLanguage();
  const locale = useLocale();
  const s = t.chaptersIndex;
  const { data: chapters, isLoading, isError } = useChapters(bookId);

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">{s.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{s.subtitle}</p>
        </div>
        <Button asChild size="sm">
          <Link href={`/books/${bookId}/chapters/new`}>
            <PlusIcon className="mr-1 size-4" />
            {s.newChapter}
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[52px] animate-pulse rounded-lg border bg-muted/40"
            />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {s.loadError}
          </CardContent>
        </Card>
      ) : !chapters || chapters.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileTextIcon className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{s.empty}</p>
              <p className="text-xs text-muted-foreground">{s.emptyDesc}</p>
            </div>
            <Button asChild size="sm">
              <Link href={`/books/${bookId}/chapters/new`}>
                <PlusIcon className="mr-1 size-4" />
                {s.newChapter}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ol className="grid gap-2">
          {chapters.map((ch) => (
            <li key={ch.id}>
              <Link
                href={`/books/${bookId}/chapters/${ch.id}`}
                className="flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span className="w-8 shrink-0 text-center font-display text-sm font-semibold text-muted-foreground">
                  {ch.chapterNumber}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {ch.title?.trim() ? ch.title : s.untitled}
                </span>
                <Badge
                  variant={STATUS_COLORS[ch.status] ?? "outline"}
                  className="shrink-0 text-xs"
                >
                  {getStatusLabel(ch.status, language)}
                </Badge>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {ch.wordCount.toLocaleString(locale)} {s.words}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
