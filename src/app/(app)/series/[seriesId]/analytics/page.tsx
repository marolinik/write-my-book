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

const STATUS_ORDER = ["planned", "drafted", "dev_edited", "line_edited", "beta_read", "beta_passed", "complete"] as const;

function statusLabel(s: string): string {
  return s.replace(/_/g, " ");
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

  const books = await db.book.findMany({
    where: { seriesId, userId: user.id },
    select: {
      id: true, bookNumber: true, name: true, status: true, wordCount: true,
      chapters: { select: { chapterNumber: true, status: true, wordCount: true } },
    },
    orderBy: { bookNumber: "asc" },
  });

  const totalWords = books.reduce((s, b) => s + (b.wordCount ?? 0), 0);
  const totalChapters = books.reduce((s, b) => s + b.chapters.length, 0);

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

      {books.map((book) => {
        const byStatus: Record<string, number> = {};
        for (const ch of book.chapters) {
          byStatus[ch.status] = (byStatus[ch.status] ?? 0) + 1;
        }
        const editedCount = book.chapters.filter((c) => c.status !== "planned" && c.status !== "drafted").length;
        return (
          <Card key={book.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  #{book.bookNumber} — {book.name}
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  {(book.wordCount ?? 0).toLocaleString()} words
                </span>
              </div>
              <CardDescription>
                {book.chapters.length} chapters · {editedCount} edited
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(byStatus).map(([status, count]) => (
                  <span
                    key={status}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {statusLabel(status)}: {count}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
