import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/auth";
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
  const { seriesId, docId } = await params;

  const series = await db.series.findFirst({
    where: { id: seriesId, userId: user.id },
  });
  if (!series) notFound();

  const svc = new DocumentService(user.id, undefined, seriesId);
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
            <ArrowLeftIcon className="mr-1 size-4" />
            All documents
          </Link>
        </Button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {doc.title ?? label}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {label}
          {doc.chapterNumber ? ` · Chapter ${doc.chapterNumber}` : ""}
          {" · "}
          {new Date(doc.updatedAt).toLocaleDateString()}
        </p>
      </div>

      <article className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
        {content}
      </article>
    </div>
  );
}
