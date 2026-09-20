import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { DocumentService } from "@/lib/documents";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  STORY_BIBLE: "Story Bible",
  ARCHITECTURE: "Architecture",
  FINGERPRINT: "Style Fingerprint",
  SERIES_BIBLE: "Series Bible",
  SERIES_ARCHITECTURE: "Series Architecture",
  SERIES_FINGERPRINT: "Series Fingerprint",
  CHAPTER_CONTENT: "Chapter Content",
  CHAPTER_PLAN: "Chapter Plan",
  DEV_EDIT_REPORT: "Dev Edit Report",
  LINE_EDIT_REPORT: "Line Edit Report",
  BETA_READ_REPORT: "Beta Read Report",
  MARKET_ANALYSIS: "Market Analysis",
  WORLD_RESEARCH: "World Research",
  TOPIC_RESEARCH: "Topic Research",
};

export default async function SeriesDocumentPage({
  params,
}: {
  params: Promise<{ seriesId: string; docId: string }>;
}) {
  const user = await requireUser();
  const t = getUIStrings(user.preferredLanguage ?? "en");
  const locale = localeFor(user.preferredLanguage ?? "en");
  const { seriesId, docId } = await params;

  const series = await db.series.findFirst({
    where: { id: seriesId, userId: user.id },
  });
  if (!series) notFound();

  // The list on /series/:id/documents shows BOTH series-level and book-level
  // documents and links them all here, so this page must open either. Reading
  // everything with a series-scoped service 404'd every book-level document the
  // writer clicked. Resolve the row first, then read it in its own scope.
  const row = await db.document.findFirst({
    where: {
      id: docId,
      OR: [
        { seriesId },
        { book: { seriesId, userId: user.id } },
      ],
    },
    select: { bookId: true, seriesId: true },
  });
  if (!row) notFound();

  const svc = new DocumentService(
    user.id,
    row.bookId ?? undefined,
    row.seriesId ?? undefined,
  );
  const result = await svc.read(docId);
  if (!result) notFound();
  const doc = result.document;
  const content = result.content;

  const label = TYPE_LABELS[doc.type] ?? doc.type;

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href={`/series/${seriesId}/documents`}>
            <ArrowLeftIcon className="mr-1 size-4" />{t.pagesUI.allDocuments}</Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {doc.title ?? label}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {label}
          {doc.chapterNumber ? ` · Chapter ${doc.chapterNumber}` : ""}
          {" · "}
          {new Date(doc.updatedAt).toLocaleDateString(locale)}
        </p>
      </div>

      <article className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
        {content}
      </article>
    </div>
  );
}
