"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { Loader2, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useReportDocument } from "./use-report-document";

export function MarketTab({ bookId }: { bookId: string }) {
  const { t } = useLanguage();
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);

  // The list endpoint carries metadata only; the prose needs its own request.
  // Reading `rawContent` off a list entry is what made this tab claim "No
  // content available" over a 21kB report (S3-10).
  const { document: marketReport, content, isLoading, isEmpty } =
    useReportDocument(bookId, "MARKET_REPORT");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t.appUI.marketAnalysis}</h3>
          <p className="text-sm text-muted-foreground">
            {t.reportTabs.marketSubtitle}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => openWithWorkflow("market-analysis")}
        >
          <PlayIcon className="mr-2 h-4 w-4" />
          {t.reportTabs.marketRun}
        </Button>
      </div>

      {marketReport ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.appUI.marketReport}</CardTitle>
            <CardDescription>{t.reportTabs.marketBy}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
              {isEmpty ? t.reportTabs.reportLost : content}
            </div>

            {/* A finished report that proposes nothing is a dead end (S3-18).
                Positioning is what the blurb and the store copy are written
                from, so that is where this one leads. */}
            {!isEmpty && (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.reportTabs.nextStep}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.reportTabs.marketNext}
                  </p>
                </div>
                <Button size="sm" className="ml-auto shrink-0" asChild>
                  <Link href={`/books/${bookId}/marketing`}>
                    {t.reportTabs.marketNextDo}
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {t.reportTabs.marketEmpty}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
