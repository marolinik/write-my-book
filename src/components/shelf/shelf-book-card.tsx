import Link from "next/link";
import { ArrowRightIcon, MessageSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShelfBookView } from "@/lib/shelf/types";
import { buildSubtitle, type SubtitleStrings } from "@/lib/shelf/card-subtitle";
import { ArchiveMenu } from "./archive-menu";

/**
 * The strings this card needs. They arrive as props because the whole shelf is
 * server rendered: `useLanguage()` is a client hook, and calling it here threw
 * at request time for every writer (D-206). The server page already resolves
 * the dictionary with `getUIStrings`, so it has them to give.
 */
export interface ShelfCardStrings {
  /** The subtitle's own words — resolved on the server with everything else. */
  subtitle: SubtitleStrings;
  /** UI language, for the plural forms inside the subtitle. */
  language: string;
  open: string;
  /** Carries an `{n}` placeholder for the chapter number. */
  continueToChapter: string;
  reviewFeedback: string;
}

function PrimaryCta({
  book,
  strings,
}: {
  book: ShelfBookView;
  strings: ShelfCardStrings;
}) {
  if (book.shelf === "currentlyWriting" && book.lastChapterId) {
    return (
      <Button asChild size="sm" variant="secondary" className="mt-3">
        <Link href={`/books/${book.id}/chapters/${book.lastChapterId}`}>
          {strings.continueToChapter.replace(
            "{n}",
            String(book.lastChapterNumber ?? "?")
          )}
          <ArrowRightIcon className="ml-1 size-3.5" />
        </Link>
      </Button>
    );
  }
  if (book.shelf === "waiting") {
    return (
      <Button asChild size="sm" variant="secondary" className="mt-3">
        <Link href={`/books/${book.id}/editorial`}>
          <MessageSquareIcon className="mr-1 size-3.5" />
          {strings.reviewFeedback}
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="secondary" className="mt-3">
      <Link href={`/books/${book.id}`}>{strings.open}</Link>
    </Button>
  );
}

interface ShelfBookCardProps {
  book: ShelfBookView;
  /** BCP-47 locale tag so word counts don't leak the server locale. */
  locale: string;
  strings: ShelfCardStrings;
}

export function ShelfBookCard({ book, locale, strings }: ShelfBookCardProps) {
  return (
    <Card className={book.shelf === "archived" ? "opacity-70" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">
            <Link href={`/books/${book.id}`} className="hover:underline">
              {book.name}
            </Link>
          </CardTitle>
          <div className="flex items-center gap-1">
            {book.genre && (
              <Badge variant="secondary" className="text-xs capitalize">
                {book.genre}
              </Badge>
            )}
            <ArchiveMenu bookId={book.id} archived={book.shelf === "archived"} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">
          {buildSubtitle(book, locale, strings.subtitle, strings.language)}
        </p>
        <PrimaryCta book={book} strings={strings} />
      </CardContent>
    </Card>
  );
}
