import Link from "next/link";
import { ArrowRightIcon, MessageSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShelfBookView } from "@/lib/shelf/types";
import { ArchiveMenu } from "./archive-menu";

function lastTouched(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function subtitle(book: ShelfBookView): string {
  const words = `${book.words.toLocaleString()} words`;
  switch (book.shelf) {
    case "currentlyWriting":
      return book.chapters > 0
        ? `${words} · drafted ${book.drafted}/${book.chapters} · last touched ${lastTouched(book.lastTouchedDays)}`
        : `${words} · not started · created ${lastTouched(book.lastTouchedDays)}`;
    case "waiting": {
      const notes = `${book.pendingFindings} note${book.pendingFindings === 1 ? "" : "s"} pending`;
      return book.chapters > 0
        ? `${notes} · dev-edit ${book.analyzed}/${book.chapters} chapters`
        : notes;
    }
    case "completed":
      return `Finished · ${words} · ${book.chapters} chapters`;
    case "archived":
      return `Archived · ${words}`;
  }
}

function PrimaryCta({ book }: { book: ShelfBookView }) {
  if (book.shelf === "currentlyWriting" && book.lastChapterId) {
    return (
      <Button asChild size="sm" variant="secondary" className="mt-3">
        <Link href={`/books/${book.id}/chapters/${book.lastChapterId}`}>
          Continue → Ch {book.lastChapterNumber}
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
          Review feedback
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="secondary" className="mt-3">
      <Link href={`/books/${book.id}`}>Open</Link>
    </Button>
  );
}

interface ShelfBookCardProps {
  book: ShelfBookView;
}

export function ShelfBookCard({ book }: ShelfBookCardProps) {
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
        <p className="text-xs text-muted-foreground">{subtitle(book)}</p>
        <PrimaryCta book={book} />
      </CardContent>
    </Card>
  );
}
