"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/providers/language-provider";

interface SeriesBook {
  id: string;
  name: string;
  bookNumber: number;
}

/**
 * Market standing across the volumes.
 *
 * A market report is written per book — genre positioning is a claim about one
 * title, not about a shelf. So the series view is a register: which volumes
 * have been analysed, which have not, and a way into each. Volume one usually
 * carries the series' positioning, and seeing that volume three has never been
 * looked at is the useful fact this page exists to show (S3-17).
 */
export function SeriesMarketPanel({ books }: { books: SeriesBook[] }) {
  const { t } = useLanguage();
  const s = t.bookUI;

  const ordered = [...books].sort((a, b) => a.bookNumber - b.bookNumber);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{s.seriesTabMarket}</CardTitle>
        <p className="text-sm text-muted-foreground">{s.seriesMarketWhat}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {ordered.map((book) => (
          <VolumeMarketRow key={book.id} book={book} />
        ))}
      </CardContent>
    </Card>
  );
}

function VolumeMarketRow({ book }: { book: SeriesBook }) {
  const { t } = useLanguage();
  const s = t.bookUI;

  const { data } = useQuery({
    queryKey: ["book-documents", book.id],
    queryFn: async () => {
      const res = await fetch(`/api/books/${book.id}/documents`);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const documents: Array<{ type: string; id: string }> = Array.isArray(data)
    ? data
    : (data?.documents ?? []);
  const hasReport = documents.some((d) => d.type === "MARKET_REPORT");

  return (
    <Link
      href={
        hasReport
          ? `/books/${book.id}/reports?tab=market`
          : `/books/${book.id}/reports?tab=market`
      }
      className="flex items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:border-primary/50"
      title={hasReport ? s.seriesOpenMarket : s.seriesRunMarket}
    >
      <span className="min-w-0 truncate text-sm font-medium">
        {book.bookNumber}. {book.name}
      </span>
      {hasReport ? (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {s.seriesOpenMarket}
        </Badge>
      ) : (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {s.seriesNoMarket}
        </Badge>
      )}
    </Link>
  );
}
