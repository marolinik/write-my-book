import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

interface SeriesAnalyticsBook {
  bookId: string;
  bookNumber: number;
  name: string;
  status: string;
  wordCount: number;
  chapterCount: number;
  documentCount: number;
  chapterStatusCounts: Record<string, number>;
}

export default async function SeriesAnalyticsPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const user = await requireUser();
  const { seriesId } = await params;

  const series = await db.series.findFirst({
    where: { id: seriesId, userId: user.id },
  });
  if (!series) notFound();

  const books = (await db.book.findMany({
    where: { seriesId, userId: user.id },
    select: { id: true, bookNumber: true, name: true, status: true, wordCount: true },
    orderBy: { bookNumber: "asc" },
  })) as unknown as Array<{
    id: string; bookNumber: number; name: string; status: string; wordCount: number;
  }>;

  const totalWords = books.reduce((s, b) => s + (b.wordCount ?? 0), 0);
  const totalChapters = books.reduce((s, b) => s + ((b as { chapterCount?: number }).chapterCount ?? 0), 0);
  const doneCount = books.filter((b) => b.status === "complete").length;

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href={`/series/${seriesId}`}>
            <ArrowLeftIcon className="mr-1 size-4" />
            Back to series
          </Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Analytics
        </h1>
        <p className="text-muted-foreground">
          Progress across &ldquo;{series.title}&rdquo;.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Books</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{books.length}</div>
            <p className="text-xs text-muted-foreground">{doneCount} complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total words</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Chapters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChapters}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Series type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{series.seriesType}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Books</CardTitle>
          <CardDescription>Per-book progress</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {books.length === 0 ? (
            <p className="text-sm text-muted-foreground">No books yet.</p>
          ) : (
            books.map((b) => (
              <Link
                key={b.id}
                href={`/books/${b.id}`}
                className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent transition-colors"
              >
                <span className="text-sm font-medium">
                  #{b.bookNumber} — {b.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(b.wordCount ?? 0).toLocaleString()} words · {b.status}
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
