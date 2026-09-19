import Link from "next/link";
import { BookOpenIcon, PlusIcon } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { countWithNoun } from "@/lib/i18n/plural";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildRollups } from "@/lib/shelf/chapter-rollup";
import { groupBooks } from "@/lib/shelf/group-books";
import type { ChapterRollup, ChapterStatusRow, ShelfBookInput } from "@/lib/shelf/types";
import { ShelfSection } from "@/components/shelf/shelf-section";

export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const user = await requireUser();
  const t = getUIStrings(user.preferredLanguage ?? "en");
  const locale = localeFor(user.preferredLanguage ?? "en");
  const s = t.bookList;
  // The shelf cards are server rendered, so their strings travel as props
  // rather than through the client language provider (D-206).
  const cardStrings = {
    subtitle: s,
    // Drives note pluralisation in the subtitle (S3-24).
    language: user.preferredLanguage ?? "en",
    open: t.appUI.open,
    continueToChapter: t.appUI.continueToChapter,
    reviewFeedback: t.appUI.reviewFeedback,
  };

  // Q1 (essential): books + signals. Includes archived rows; grouper splits by archivedAt.
  const rows = await db.book.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      genre: true,
      status: true,
      wordCount: true,
      archivedAt: true,
      updatedAt: true,
      _count: {
        select: {
          chapters: true,
          editFindings: { where: { status: "pending" } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const books: ShelfBookInput[] = rows.map((b) => ({
    id: b.id,
    name: b.name,
    genre: b.genre,
    status: b.status,
    wordCount: b.wordCount,
    archivedAt: b.archivedAt,
    updatedAt: b.updatedAt,
    chapterCount: b._count.chapters,
    pendingFindings: b._count.editFindings,
  }));

  // Q2 (secondary, degradable): per-book chapter-status tally.
  let rollups = new Map<string, ChapterRollup>();
  try {
    const grouped = await db.chapter.groupBy({
      by: ["bookId", "status"],
      where: { book: { userId: user.id } },
      _count: true,
    });
    const statusRows: ChapterStatusRow[] = grouped.map((g) => ({
      bookId: g.bookId,
      status: g.status,
      count: g._count,
    }));
    rollups = buildRollups(statusRows);
  } catch (error) {
    console.error("Shelf: chapter rollup failed, degrading", error);
  }

  // Q3 (secondary, degradable): latest chapter per book for the Continue deep-link.
  let lastChapters = new Map<string, { id: string; chapterNumber: number }>();
  try {
    const chapters = await db.chapter.findMany({
      where: { book: { userId: user.id } },
      orderBy: [{ bookId: "asc" }, { updatedAt: "desc" }],
      distinct: ["bookId"],
      select: { bookId: true, id: true, chapterNumber: true },
    });
    lastChapters = new Map(
      chapters.map((c) => [c.bookId, { id: c.id, chapterNumber: c.chapterNumber }]),
    );
  } catch (error) {
    console.error("Shelf: last-chapter lookup failed, degrading", error);
  }

  const groups = groupBooks({ books, rollups, lastChapters, now: new Date() });
  const total = books.length;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{s.title}</h1>
          <p className="text-sm text-muted-foreground">
            {/* Serbian counts in three: 1 knjiga, 3 knjige, 5 knjiga (S3-24). */}
            {countWithNoun(total, s.book, s.books, {
              few: s.bookFew,
              language: user.preferredLanguage ?? "en",
            })}
          </p>
        </div>
        <Button asChild>
          <Link href="/books/new">
            <PlusIcon className="mr-1 size-4" />
            {s.newBook}
          </Link>
        </Button>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpenIcon className="mb-4 size-12 text-muted-foreground/50" />
            <h2 className="mb-1 text-lg font-medium">{s.noBooks}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{s.noBooksDesc}</p>
            <Button asChild>
              <Link href="/books/new">
                <PlusIcon className="mr-1 size-4" />
                {s.createBook}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div>
          <ShelfSection title={t.appUI.currentlyWriting} books={groups.currentlyWriting} locale={locale} strings={cardStrings} />
          <ShelfSection title={t.appUI.waitingForFeedback} books={groups.waiting} locale={locale} strings={cardStrings} />
          <ShelfSection title={t.appUI.completed} books={groups.completed} locale={locale} strings={cardStrings} />
          <ShelfSection title={t.appUI.archived} books={groups.archived} locale={locale} strings={cardStrings} collapsible />
        </div>
      )}
    </div>
  );
}
