import Link from "next/link";
import { notFound } from "next/navigation";
import { FileTextIcon, PlusIcon, ArrowLeftIcon } from "lucide-react";
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

interface DocRow {
  id: string;
  type: string;
  title: string | null;
  chapterNumber: number | null;
  updatedAt: string | Date;
}

export default async function SeriesDocumentsPage({
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

  const documents = (await db.document.findMany({
    where: { seriesId },
    orderBy: { updatedAt: "desc" },
  })) as DocRow[];

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
          Documents
        </h1>
        <p className="text-muted-foreground">
          Shared documents for &ldquo;{series.title}&rdquo;.
        </p>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileTextIcon className="size-10 text-muted-foreground/40 mb-4" />
            <p className="text-sm text-muted-foreground">
              No documents yet. Series-level documents (story bible, architecture,
              style fingerprint) are created by the agents and appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {doc.title ?? doc.type}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <CardDescription>{doc.type}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Document id: {doc.id}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
