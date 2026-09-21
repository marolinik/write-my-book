"use client";

import { useLanguage } from "@/components/providers/language-provider";
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
// O4: the document-type names already ship per language; this file kept its
// own English copy of the same table.
import { getDocumentTypeLabels } from "@/lib/agents/tool-labels";


export function DocumentsTab({ bookId }: { bookId: string }) {
  const { t, language } = useLanguage();
  const docTypeLabels = getDocumentTypeLabels(language);
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
        <CardTitle>{t.appUI.documents}</CardTitle>
        <CardDescription>{t.appUI.documentsHint}</CardDescription>
      </CardHeader>
      <CardContent>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t.reportsUI.noDocumentsYet}</p>
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
                      {doc.title || docTypeLabels[doc.type] || doc.type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {docTypeLabels[doc.type] || doc.type}
                      {doc.chapterNumber ? ` — ${t.agentUI.chapterAbbrev} ${doc.chapterNumber}` : ""}
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
