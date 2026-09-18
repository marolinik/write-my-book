"use client";

import { use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import {
  AnalyticsTab,
  ContinuityTab,
  MarketTab,
  EditsOverviewTab,
  DocumentsTab,
  StructureTab,
} from "@/components/reports";
import { SparklesIcon } from "lucide-react";

/**
 * The tabs are addressable so a link can land on one. Without this, "Review
 * proposals" on the Razvoj board dropped the writer on Analytics and left him
 * hunting for the structure panel (S3-4).
 */
const TABS = [
  "analytics",
  "continuity",
  "structure",
  "market",
  "edits",
  "documents",
] as const;

export default function ReportsPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const activeTab = TABS.includes(requested as (typeof TABS)[number])
    ? (requested as string)
    : "analytics";
  const { t } = useLanguage();
  const s = t.reports;
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {s.title}
          </h1>
          <p className="text-muted-foreground">
            {s.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openWithWorkflow("analyze")}
          >
            <SparklesIcon className="mr-1.5 size-3.5" />
            {t.screens.generateReports}
          </Button>
        </div>
      </div>

      <Separator className="my-6" />

      <Tabs
        value={activeTab}
        onValueChange={(tab) => {
          // replace, not push: flipping tabs should not fill the back button.
          router.replace(`/books/${bookId}/reports?tab=${tab}`, { scroll: false });
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="analytics">{s.analytics}</TabsTrigger>
          <TabsTrigger value="continuity">{s.continuity}</TabsTrigger>
          <TabsTrigger value="structure">{t.structure.tab}</TabsTrigger>
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
        <TabsContent value="structure" className="mt-6">
          <StructureTab bookId={bookId} />
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
