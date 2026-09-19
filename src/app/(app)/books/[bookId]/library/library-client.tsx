"use client";

import { useState } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileTextIcon, BookMarkedIcon, UsersIcon } from "lucide-react";
import { WikiPage } from "@/components/book/wiki-page";
import { DocumentsLibrary } from "@/components/book/documents-library";
import { CharacterChat } from "@/components/agent/character-chat";
import { useWikiEntities } from "@/hooks/use-wiki";

interface LibraryPageClientProps {
  bookId: string;
  language: string;
  initialTab: "documents" | "wiki" | "characters";
}

export function LibraryPageClient({ bookId, language, initialTab }: LibraryPageClientProps) {
  const [tab, setTab] = useState<string>(initialTab);
  const { t } = useLanguage();

  // Fetch all wiki entities to extract characters for the chat tab
  const { data: entities = [] } = useWikiEntities(bookId, "character");

  const characters = entities.map((e) => ({
    id: e.id,
    name: e.name,
    role: (e.attributes as Record<string, string>)?.role ?? "character",
    description: e.description ?? "",
  }));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v)}>
        <TabsList className="mb-6">
          <TabsTrigger value="documents" className="gap-1.5">
            <FileTextIcon className="size-3.5" />
            {t.nav.documents}
          </TabsTrigger>
          <TabsTrigger value="wiki" className="gap-1.5">
            <BookMarkedIcon className="size-3.5" />
            {t.docLibrary.worldBible}
          </TabsTrigger>
          <TabsTrigger value="characters" className="gap-1.5">
            <UsersIcon className="size-3.5" />
            {t.docLibrary.chatCharacters}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="mt-0">
          <DocumentsLibrary bookId={bookId} />
        </TabsContent>
        <TabsContent value="wiki" className="mt-0">
          <WikiPage bookId={bookId} language={language} />
        </TabsContent>
        <TabsContent value="characters" className="mt-0">
          <CharacterChat bookId={bookId} characters={characters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
