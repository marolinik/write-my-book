"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Issue 4: Tab-based book overview layout.
 * Organizes the book overview into scannable sections:
 * - "At a Glance" (default): progress, stats, recommended action, recent sessions
 * - "Chapters": full-width chapter list/canvas/pipeline views
 * - "Documents": book-level documents library
 */
interface BookOverviewTabsProps {
  /** At a Glance content: progress bars, stats, sessions, findings */
  glance: React.ReactNode;
  /** Chapters content: BookViewSwitcher */
  chapters: React.ReactNode;
  /** Documents content: document list */
  documents: React.ReactNode;
  /** Whether there are any chapters */
  hasChapters: boolean;
  /** Whether there are any documents */
  hasDocuments: boolean;
  /** Labels for the tabs */
  labels: {
    atAGlance?: string;
    chapters?: string;
    documents?: string;
  };
}

export function BookOverviewTabs({
  glance,
  chapters,
  documents,
  hasChapters,
  hasDocuments,
  labels,
}: BookOverviewTabsProps) {
  const [tab, setTab] = useState("glance");

  return (
    <Tabs value={tab} onValueChange={setTab} className="mt-2">
      <TabsList className="mb-4">
        <TabsTrigger value="glance">{labels.atAGlance ?? "At a Glance"}</TabsTrigger>
        {hasChapters && (
          <TabsTrigger value="chapters">{labels.chapters ?? "Chapters"}</TabsTrigger>
        )}
        {hasDocuments && (
          <TabsTrigger value="documents">{labels.documents ?? "Documents"}</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="glance" className="space-y-8">
        {glance}
      </TabsContent>

      {hasChapters && (
        <TabsContent value="chapters">
          {chapters}
        </TabsContent>
      )}

      {hasDocuments && (
        <TabsContent value="documents">
          {documents}
        </TabsContent>
      )}
    </Tabs>
  );
}
