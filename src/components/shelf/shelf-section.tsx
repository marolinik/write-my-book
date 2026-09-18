import { ShelfBookCard, type ShelfCardStrings } from "./shelf-book-card";
import type { ShelfBookView } from "@/lib/shelf/types";

interface ShelfSectionProps {
  title: string;
  books: ShelfBookView[];
  /** BCP-47 locale tag for number/date formatting on the cards. */
  locale: string;
  /** Resolved on the server: the shelf renders without a client provider. */
  strings: ShelfCardStrings;
  /** Archived uses a <details> so the attic starts closed. */
  collapsible?: boolean;
}

function Grid({
  books,
  locale,
  strings,
}: {
  books: ShelfBookView[];
  locale: string;
  strings: ShelfCardStrings;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => (
        <ShelfBookCard
          key={book.id}
          book={book}
          locale={locale}
          strings={strings}
        />
      ))}
    </div>
  );
}

export function ShelfSection({
  title,
  books,
  locale,
  strings,
  collapsible,
}: ShelfSectionProps) {
  if (books.length === 0) return null; // empty active shelves are hidden

  if (collapsible) {
    return (
      <details className="mt-8">
        <summary className="cursor-pointer select-none text-sm font-semibold text-muted-foreground">
          {title} ({books.length})
        </summary>
        <div className="mt-4">
          <Grid books={books} locale={locale} strings={strings} />
        </div>
      </details>
    );
  }

  return (
    <section className="mt-8 first:mt-0">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title} <span className="text-muted-foreground/60">({books.length})</span>
      </h2>
      <Grid books={books} locale={locale} strings={strings} />
    </section>
  );
}
