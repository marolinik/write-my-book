"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, FileTextIcon } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/language-provider";

const DOC_TYPE_LABELS: Record<string, string> = {
  CONCEPT: "Concept",
  STORY_BIBLE: "Story Bible",
  ARCHITECTURE: "Architecture",
  FINGERPRINT: "Fingerprint",
  CHAPTER_BRIEF: "Chapter Brief",
  CHAPTER_PLAN: "Chapter Plan",
  CHAPTER_CONTENT: "Chapter Content",
  DEV_EDIT_REPORT: "Dev Edit Report",
  LINE_EDIT_REPORT: "Line Edit Report",
  BETA_READ_REPORT: "Beta Read Report",
  CONTINUITY_REPORT: "Continuity Report",
  ANALYSIS_REPORT: "Analysis Report",
  MARKET_REPORT: "Market Report",
  EXPORT_CONFIG: "Export Config",
  FREEWRITE: "Freewrite",
};

export function DocumentsTab({ bookId }: { bookId: string }) {
  const locale = useLocale();
  const { data: documents, isLoading } = useQuery({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const docs = documents?.documents ?? documents ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>All documents associated with this book</CardDescription>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No documents yet. Documents are created when you run agent workflows.
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc: any) => (
              <Link
                key={doc.id}
                href={`/books/${bookId}/documents/${doc.id}`}
                className="flex items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-3">
                  <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {doc.title || DOC_TYPE_LABELS[doc.type] || doc.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {DOC_TYPE_LABELS[doc.type] || doc.type}
                      {doc.chapterNumber ? ` — Ch. ${doc.chapterNumber}` : ""}
                      {" · v"}{doc.currentVersion}
                    </p>
                  </div>
                </div>
                <Badge variant="outline">
                  {new Date(doc.updatedAt).toLocaleDateString(locale)}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
