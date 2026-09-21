import Link from "next/link";
import { notFound } from "next/navigation";
import { FileTextIcon, ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { getDocumentTypeLabels } from "@/lib/agents/tool-labels";
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

interface DocRow {
  id: string;
  type: string;
  title: string | null;
  chapterNumber: number | null;
  updatedAt: string | Date;
  bookId: string | null;
}


export default async function SeriesDocumentsPage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const user = await requireUser();
  const t = getUIStrings(user.preferredLanguage ?? "en");
  const locale = localeFor(user.preferredLanguage ?? "en");
  const typeLabels = getDocumentTypeLabels(user.preferredLanguage ?? "en");
  const { seriesId } = await params;

  const series = await db.series.findFirst({
    where: { id: seriesId, userId: user.id },
    include: { books: { select: { id: true, name: true, bookNumber: true } } },
  });
  if (!series) notFound();

  const bookIds = series.books.map((b) => b.id);
  const documents = (await db.document.findMany({
    where: {
      OR: [{ seriesId }, { bookId: { in: bookIds } }],
    },
    orderBy: { updatedAt: "desc" },
  })) as DocRow[];

  const bookNameById = new Map(series.books.map((b) => [b.id, b.name]));

  // Group: series-level first, then per-book
  const seriesDocs = documents.filter((d) => d.bookId === null);
  const bookDocs = documents.filter((d) => d.bookId !== null);

  return (
    <div className="p-6 lg:p-8 max-w-4xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href={`/series/${seriesId}`}>
            <ArrowLeftIcon className="mr-1 size-4" />{t.pagesUI.backToSeries}</Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t.nav.documents}</h1>
        <p className="text-muted-foreground">
          {t.pagesUI.everythingCreatedIn.replace("{series}", series.title)}
        </p>
      </div>

      {seriesDocs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{t.pagesUI.seriesLevel}</h2>
          {seriesDocs.map((doc) => (
            <DocCard locale={locale} t={t} typeLabels={typeLabels} key={doc.id} doc={doc} bookName={null} seriesId={seriesId} />
          ))}
        </div>
      )}

      {bookDocs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{t.pagesUI.bookLevel}</h2>
          {bookDocs.map((doc) => (
            <DocCard locale={locale} t={t} typeLabels={typeLabels} key={doc.id} doc={doc} bookName={bookNameById.get(doc.bookId!) ?? null} seriesId={seriesId} />
          ))}
        </div>
      )}

      {documents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileTextIcon className="size-10 text-muted-foreground/40 mb-4" />
            <p className="text-sm text-muted-foreground">{t.pagesUI.noSeriesDocs}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DocCard({ doc, bookName, seriesId, locale, t, typeLabels }: {
  doc: DocRow;
  bookName: string | null;
  seriesId: string;
  /** M-5: the card formats a date, so the writer's locale travels with it. */
  locale: string;
  t: UIStrings;
  typeLabels: Record<string, string>;
}) {
  const label = typeLabels[doc.type] ?? doc.type;
  const subtitle = bookName
    ? t.pagesUI.bookNamed.replace("{book}", bookName)
    : t.pagesUI.seriesWide;
  const ch = doc.chapterNumber ? ` · Ch.${doc.chapterNumber}` : "";
  return (
    <Link href={`/series/${seriesId}/documents/${doc.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-base truncate">
                {doc.title ?? label}
              </CardTitle>
              <CardDescription>
                {label}
                {ch} · {subtitle}
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(doc.updatedAt).toLocaleDateString(locale)}
            </span>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
