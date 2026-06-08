"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileTextIcon, BookMarkedIcon } from "lucide-react";
import { WikiPage } from "@/components/book/wiki-page";
import { DocumentsLibrary } from "@/components/book/documents-library";

interface LibraryPageClientProps {
  bookId: string;
  language: string;
  initialTab: "documents" | "wiki";
}

export function LibraryPageClient({ bookId, language, initialTab }: LibraryPageClientProps) {
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "documents" | "wiki")}>
        <TabsList className="mb-6">
          <TabsTrigger value="documents" className="gap-1.5">
            <FileTextIcon className="size-3.5" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="wiki" className="gap-1.5">
            <BookMarkedIcon className="size-3.5" />
            World Bible
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-0">
          <DocumentsLibrary bookId={bookId} />
        </TabsContent>
        <TabsContent value="wiki" className="mt-0">
          <WikiPage bookId={bookId} language={language} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
