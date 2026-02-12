import Link from "next/link";
import {
  BookOpenIcon,
  PenLineIcon,
  FileTextIcon,
  PlusIcon,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [books, stats] = await Promise.all([
    db.book.findMany({
      where: { userId: user.id },
      include: {
        _count: { select: { chapters: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    db.book.aggregate({
      where: { userId: user.id },
      _sum: { wordCount: true, chapterCount: true },
      _count: true,
    }),
  ]);

  const totalBooks = stats._count;
  const totalWords = stats._sum.wordCount ?? 0;
  const totalChapters = stats._sum.chapterCount ?? 0;
  const t = getUIStrings(user.preferredLanguage ?? "en");

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">
          {t.dashboard.welcomeBack}, {user.displayName || t.dashboard.writer}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t.dashboard.yourWorkspace}
        </p>
      </div>

      {/* Stats Row */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
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
            <div className="text-2xl font-bold">
              {totalWords.toLocaleString()}
            </div>
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
      </div>

      {/* Recent Books */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-semibold">{t.dashboard.recentBooks}</h2>
        <Button asChild size="sm">
          <Link href="/books/new">
            <PlusIcon className="mr-1 size-4" />
            {t.dashboard.createBook}
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
  );
}
