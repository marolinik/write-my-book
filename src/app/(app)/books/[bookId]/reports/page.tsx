"use client";

import { use } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/components/providers/language-provider";
import {
  AnalyticsTab,
  ContinuityTab,
  MarketTab,
  EditsOverviewTab,
  DocumentsTab,
} from "@/components/reports";

export default function ReportsPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const { t } = useLanguage();
  const s = t.reports;

  return (
    <div className="p-6 lg:p-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {s.title}
      </h1>
      <p className="text-muted-foreground">
        {s.subtitle}
      </p>

      <Separator className="my-6" />

      <Tabs defaultValue="analytics">
        <TabsList className="flex-wrap">
          <TabsTrigger value="analytics">{s.analytics}</TabsTrigger>
          <TabsTrigger value="continuity">{s.continuity}</TabsTrigger>
          <TabsTrigger value="market">{s.market}</TabsTrigger>
          <TabsTrigger value="edits">{s.edits}</TabsTrigger>
          <TabsTrigger value="documents">{s.documents}</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-6">
          <AnalyticsTab bookId={bookId} />
        </TabsContent>
        <TabsContent value="continuity" className="mt-6">
          <ContinuityTab bookId={bookId} />
        </TabsContent>
        <TabsContent value="market" className="mt-6">
          <MarketTab bookId={bookId} />
        </TabsContent>
        <TabsContent value="edits" className="mt-6">
          <EditsOverviewTab bookId={bookId} />
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <DocumentsTab bookId={bookId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
