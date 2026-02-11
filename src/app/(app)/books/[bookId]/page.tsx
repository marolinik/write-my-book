import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PlusIcon,
  SettingsIcon,
  FileTextIcon,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  undiscussed: "outline",
  discussed: "outline",
  planned: "secondary",
  drafted: "secondary",
  dev_edited: "default",
  line_edited: "default",
  beta_read: "default",
  beta_passed: "default",
};

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    include: {
      chapters: { orderBy: { chapterNumber: "asc" } },
      documents: {
        where: { chapterNumber: null },
        orderBy: { updatedAt: "desc" },
      },
      series: { select: { id: true, title: true } },
      _count: { select: { documents: true } },
    },
  });

  if (!book) notFound();

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold">{book.name}</h1>
            <Badge variant="secondary" className="capitalize">
              {book.status}
            </Badge>
          </div>
          {book.genre && (
            <p className="text-sm text-muted-foreground mt-1">{book.genre}</p>
          )}
          {book.series && (
            <p className="text-sm text-muted-foreground">
              <Link
                href={`/series/${book.series.id}`}
                className="hover:underline"
              >
                {book.series.title}
              </Link>{" "}
              &mdash; Book #{book.bookNumber}
            </p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/books/${bookId}/settings`}>
            <SettingsIcon className="mr-1 size-4" />
            Settings
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Words
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {book.wordCount.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Chapters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{book.chapters.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{book._count.documents}</div>
          </CardContent>
        </Card>
      </div>

      {/* Chapters */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Chapters</h2>
          <Button asChild size="sm">
            <Link href={`/books/${bookId}/chapters/new`}>
              <PlusIcon className="mr-1 size-4" />
              Add Chapter
            </Link>
          </Button>
        </div>

        {book.chapters.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No chapters yet. Add your first chapter to start writing.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">#</th>
                  <th className="px-4 py-2 text-left font-medium">Title</th>
                  <th className="px-4 py-2 text-left font-medium">Act</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Words</th>
                  <th className="px-4 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {book.chapters.map((ch) => (
                  <tr key={ch.id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">
                      {ch.chapterNumber}
                    </td>
                    <td className="px-4 py-2">
                      {ch.title || (
                        <span className="text-muted-foreground italic">
                          Untitled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      Act {ch.actNumber}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={STATUS_COLORS[ch.status] ?? "outline"}
                        className="text-xs capitalize"
                      >
                        {ch.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {ch.wordCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button asChild variant="ghost" size="xs">
                        <Link href={`/books/${bookId}/chapters/${ch.id}`}>
                          Edit
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Documents */}
      {book.documents.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-semibold mb-4">
            Documents
          </h2>
          <div className="grid gap-2">
            {book.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-md border px-4 py-2"
              >
                <FileTextIcon className="size-4 text-muted-foreground" />
                <span className="text-sm">{doc.title || doc.type}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {doc.type.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  v{doc.currentVersion}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
