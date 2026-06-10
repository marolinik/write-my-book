import Link from "next/link";
import {
  BookOpenIcon,
  PenLineIcon,
  FileTextIcon,
  PlusIcon,
  PlayIcon,
  UploadIcon,
  LibraryIcon,
  ArrowRightIcon,
  BotIcon,
  AlertTriangleIcon,
  ActivityIcon,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDailyWordCounts } from "@/lib/writing-stats";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { getWorkflow } from "@/lib/agents/workflows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WritingWrappedCard } from "@/components/book/writing-wrapped-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

function getWorkflowLabel(workflowId: string | null, lang: string): string {
  if (!workflowId) return "Agent session";
  const strings = getAgentStrings(lang);
  return strings.workflows[workflowId] ?? getWorkflow(workflowId)?.label ?? workflowId;
}

export default async function DashboardPage() {
  const user = await requireUser();

  const [books, stats, seriesList, recentSessions, pendingFindings, failedBetaChapters, alerts] =
    await Promise.all([
      // Recent books
      db.book.findMany({
        where: { userId: user.id },
        include: { _count: { select: { chapters: true } } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      // Aggregate stats
      db.book.aggregate({
        where: { userId: user.id },
        _sum: { wordCount: true, chapterCount: true },
        _count: true,
      }),
      // Series with book counts and total words
      db.series.findMany({
        where: { userId: user.id },
        include: {
          books: {
            select: { id: true, wordCount: true },
          },
          _count: { select: { books: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      // Recent completed agent sessions
      db.agentSession.findMany({
        where: { userId: user.id, status: "completed" },
        orderBy: { completedAt: "desc" },
        include: { book: { select: { name: true, id: true } } },
        take: 5,
      }),
      // Pending findings count
      db.editFinding.count({
        where: { book: { userId: user.id }, status: "pending" },
      }),
      // Failed beta chapters
      db.chapter.findMany({
        where: { book: { userId: user.id }, betaGate: "failed" },
        include: { book: { select: { name: true, id: true } } },
        take: 5,
      }),
      // Book notifications (unread alerts)
      db.bookNotification.findMany({
        where: { userId: user.id, read: false, dismissedAt: null },
        orderBy: { createdAt: "desc" },
        include: { book: { select: { name: true, id: true } } },
        take: 5,
      }),
    ]);

  const totalBooks = stats._count;
  const totalWords = stats._sum.wordCount ?? 0;
  const totalChapters = stats._sum.chapterCount ?? 0;
  const seriesCount = seriesList.length;
  const t = getUIStrings(user.preferredLanguage ?? "en");

  // Continue Where You Left Off: most recently updated book with its most recently updated chapter
  const lastBook = books[0] ?? null;
  let lastChapter: { chapterNumber: number; title: string | null } | null = null;
  if (lastBook) {
    const ch = await db.chapter.findFirst({
      where: { bookId: lastBook.id },
      orderBy: { updatedAt: "desc" },
      select: { chapterNumber: true, title: true },
    });
    lastChapter = ch;
  }

  // Writing activity: real per-day word deltas for the last 7 days (UTC-bucketed)
  const dailyCounts = await getDailyWordCounts({ userId: user.id, days: 7 });
  const activityDays = dailyCounts.map(({ date, words }) => ({
    date,
    words,
    label: new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }),
  }));
  const weeklyTotal = activityDays.reduce((s, d) => s + d.words, 0);
  const maxWords = Math.max(...activityDays.map((d) => d.words), 1);

  // Build alerts list
  const alertItems: { text: string; href: string; priority: string }[] = [];
  if (pendingFindings > 0) {
    alertItems.push({
      text: `${pendingFindings} findings need review`,
      href: `/books/${lastBook?.id}/editorial`,
      priority: "normal",
    });
  }
  for (const ch of failedBetaChapters) {
    alertItems.push({
      text: `Beta read failed on Ch.${ch.chapterNumber}${ch.title ? ` "${ch.title}"` : ""} — ${ch.book.name}`,
      href: `/books/${ch.book.id}/editorial`,
      priority: "high",
    });
  }
  for (const n of alerts) {
    alertItems.push({
      text: n.title,
      href: n.actionUrl ?? `/books/${n.book.id}`,
      priority: n.priority,
    });
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold">
          {t.dashboard.welcomeBack}, {user.displayName || t.dashboard.writer}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t.dashboard.yourWorkspace}
        </p>
      </div>

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/books/new">
            <PlusIcon className="mr-2 size-4" />
            {t.dashboard.createBook}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/series/new">
            <LibraryIcon className="mr-2 size-4" />
            {t.seriesPage.createSeries}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={lastBook ? `/books/${lastBook.id}` : "/books/new"}>
            <PlayIcon className="mr-2 size-4" />
            {t.dashboard.startWriting}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={lastBook ? `/books/${lastBook.id}/transfer` : "/books/new"}>
            <UploadIcon className="mr-2 size-4" />
            {t.dashboard.importManuscript}
          </Link>
        </Button>
      </div>

      {/* Stats Row — now 4 cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.totalBooks}</CardTitle>
            <BookOpenIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBooks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.totalWords}</CardTitle>
            <PenLineIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.totalChapters}</CardTitle>
            <FileTextIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalChapters}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.dashboard.totalSeries}</CardTitle>
            <LibraryIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{seriesCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Continue Where You Left Off */}
      {lastBook && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.dashboard.continueWriting}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{lastBook.name}</p>
                {lastChapter && (
                  <p className="text-sm text-muted-foreground">
                    Ch. {lastChapter.chapterNumber}
                    {lastChapter.title ? `: ${lastChapter.title}` : ""}
                    {" — "}
                    {t.dashboard.lastEdited}{" "}
                    {new Date(lastBook.updatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button asChild size="sm">
                <Link
                  href={
                    lastChapter
                      ? `/books/${lastBook.id}/documents`
                      : `/books/${lastBook.id}`
                  }
                >
                  {t.dashboard.resumeChapter}
                  <ArrowRightIcon className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Middle Row: Writing Activity + Pending Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Writing Activity Graph */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t.dashboard.writingActivity}</CardTitle>
              <span className="text-sm text-muted-foreground">
                {weeklyTotal.toLocaleString()} {t.dashboard.wordsThisWeek}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24">
              {activityDays.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-primary/80 transition-all min-h-[2px]"
                    style={{
                      height: `${Math.max((day.words / maxWords) * 80, 2)}px`,
                    }}
                    title={`${day.words.toLocaleString()} ${t.dashboard.words}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{day.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{t.dashboard.pendingAlerts}</CardTitle>
              {alertItems.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {alertItems.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {alertItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.dashboard.noAlerts}</p>
            ) : (
              <div className="space-y-2">
                {alertItems.map((alert, i) => (
                  <Link
                    key={i}
                    href={alert.href}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  >
                    <AlertTriangleIcon
                      className={`size-4 shrink-0 ${
                        alert.priority === "high" || alert.priority === "urgent"
                          ? "text-destructive"
                          : "text-yellow-500"
                      }`}
                    />
                    <span className="truncate">{alert.text}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Agent Sessions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.dashboard.recentSessions}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.dashboard.noSessions}</p>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s) => (
                <Link
                  key={s.id}
                  href={`/books/${s.bookId}`}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <BotIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">
                      {getWorkflowLabel(s.workflowId, user.preferredLanguage ?? "en")}
                    </span>
                    <span className="text-muted-foreground truncate hidden sm:inline">
                      — {s.book.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                    <span className="text-xs">
                      {((s.tokensInput + s.tokensOutput) / 1000).toFixed(0)}k tok
                    </span>
                    <span className="text-xs">
                      {s.completedAt
                        ? new Date(s.completedAt).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Books */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">{t.dashboard.recentBooks}</h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/books">
              {t.dashboard.totalBooks}
              <ArrowRightIcon className="ml-1 size-4" />
            </Link>
          </Button>
        </div>

        {books.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpenIcon className="size-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">{t.dashboard.noBooksYet}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t.dashboard.noBooksDescription}
              </p>
              <Button asChild>
                <Link href="/books/new">
                  <PlusIcon className="mr-1 size-4" />
                  {t.dashboard.createBook}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
              <Link key={book.id} href={`/books/${book.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{book.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {book.status}
                      </Badge>
                    </div>
                    {book.genre && (
                      <CardDescription>{book.genre}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{book.wordCount.toLocaleString()} {t.dashboard.words}</span>
                      <span>{book._count.chapters} {t.dashboard.chapters}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground/70">
                      {t.dashboard.updated}{" "}
                      {new Date(book.updatedAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Year in Writing Wrapped */}
      <WritingWrappedCard authorName={user.displayName ?? undefined} />

      {/* Series */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold">{t.dashboard.totalSeries}</h2>
          {seriesList.length > 0 && (
            <Button asChild size="sm" variant="outline">
              <Link href="/series/new">
                <PlusIcon className="mr-1 size-4" />
                {t.seriesPage.createSeries}
              </Link>
            </Button>
          )}
        </div>

        {seriesList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.seriesPage.noSeries} — {t.seriesPage.noSeriesDesc}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {seriesList.map((series) => {
              const totalSeriesWords = series.books.reduce((sum, b) => sum + b.wordCount, 0);
              return (
                <Link key={series.id} href={`/series/${series.id}`}>
                  <Card className="transition-colors hover:bg-accent/50">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{series.title}</CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {series.seriesType}
                        </Badge>
                      </div>
                      {series.genre && (
                        <CardDescription>{series.genre}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{series._count.books} {t.seriesPage.books}</span>
                        <span>{totalSeriesWords.toLocaleString()} {t.dashboard.words}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
