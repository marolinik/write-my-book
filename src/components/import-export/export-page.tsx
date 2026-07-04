"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FormatSelector } from "./format-selector";
import { ExportConfigDialog } from "./export-config-dialog";
import { ExportHistoryList } from "./export-history-list";
import { useExportStore } from "@/stores/export-store";
import { useExportManuscript, useDownloadExport, useExportHistory } from "@/hooks/use-export";
import { useLocale } from "@/components/providers/language-provider";
import {
  Loader2Icon,
  SettingsIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  DownloadIcon,
  InfoIcon,
} from "lucide-react";

interface ExportPageProps {
  bookId: string;
}

const FORMAT_GUIDANCE: Record<string, string> = {
  docx: "Best for agent/editor review, publisher submissions, and further editing in Word or Google Docs.",
  pdf: "Print-ready output via Typst. Ideal for proof copies and final publication with professional typography.",
  epub: "EPUB3 for Kindle, Apple Books, and other e-reader platforms. Reflowable text with embedded metadata.",
};

export function ExportPage({ bookId }: ExportPageProps) {
  const locale = useLocale();
  const {
    selectedFormat,
    isDraft,
    exportInProgress,
    lastExportResult,
    configPanelOpen,
    setSelectedFormat,
    setIsDraft,
    setExportInProgress,
    setLastExportResult,
    setConfigPanelOpen,
  } = useExportStore();

  const exportMutation = useExportManuscript(bookId);
  const downloadExport = useDownloadExport(bookId);
  const { data: historyData } = useExportHistory(bookId);

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (exportInProgress) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [exportInProgress]);

  // Find the most recent export for "download last" shortcut
  const lastExport = historyData?.exports?.[0] ?? null;

  const handleExport = () => {
    setExportInProgress(true);
    setLastExportResult(null);
    exportMutation.mutate(
      { format: selectedFormat, isDraft },
      {
        onSuccess: (result) => {
          setLastExportResult(result);
          setExportInProgress(false);
        },
        onError: () => {
          setExportInProgress(false);
        },
      }
    );
  };

  const handleDownloadLast = () => {
    if (lastExportResult) {
      downloadExport(lastExportResult.filename);
    } else if (lastExport) {
      downloadExport(lastExport.filename);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Download last export shortcut */}
      {(lastExportResult || lastExport) && !exportInProgress && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <div className="text-sm">
            <span className="font-medium">Last export: </span>
            <span className="text-muted-foreground">
              {lastExportResult?.filename ?? lastExport?.filename}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadLast}>
            <DownloadIcon className="mr-1.5 size-3.5" />
            Download
          </Button>
        </div>
      )}

      {/* Export Controls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Export Manuscript</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigPanelOpen(true)}
          >
            <SettingsIcon className="mr-1 size-4" />
            Configure
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Format selection */}
          <div>
            <Label className="mb-2 block text-sm font-medium">
              Output Format
            </Label>
            <FormatSelector
              selected={selectedFormat}
              onSelect={setSelectedFormat}
            />
          </div>

          {/* Format guidance */}
          <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <InfoIcon className="size-3 mt-0.5 shrink-0" />
            <span>{FORMAT_GUIDANCE[selectedFormat]}</span>
          </div>

          {/* Draft toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Draft Mode</Label>
              <p className="text-xs text-muted-foreground">
                Adds watermark and skips recto-start
              </p>
            </div>
            <Switch checked={isDraft} onCheckedChange={setIsDraft} />
          </div>

          {/* Export button */}
          <Button
            className="w-full"
            size="lg"
            disabled={exportInProgress}
            onClick={handleExport}
          >
            {exportInProgress ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Exporting...
              </>
            ) : (
              `Export as ${selectedFormat.toUpperCase()}`
            )}
          </Button>

          {exportInProgress && (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: "33%",
                    animation: "indeterminate 1.5s ease-in-out infinite",
                  }}
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Exporting... {elapsed}s
              </p>
              <style>{`
                @keyframes indeterminate {
                  0% { transform: translateX(-100%); }
                  50% { transform: translateX(200%); }
                  100% { transform: translateX(-100%); }
                }
              `}</style>
            </div>
          )}

          {/* Result */}
          {lastExportResult && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="size-4 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium">Export Complete</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadExport(lastExportResult.filename)}
                >
                  <DownloadIcon className="mr-1 size-3" />
                  Download
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">
                  {lastExportResult.filename}
                </Badge>
                <Badge variant="outline">
                  {lastExportResult.wordCount.toLocaleString(locale)} words
                </Badge>
                <Badge variant="outline">
                  {lastExportResult.chapterCount} chapters
                </Badge>
                <Badge variant="outline">
                  ~{lastExportResult.estimatedPages} pages
                </Badge>
              </div>
              {lastExportResult.warnings.length > 0 && (
                <div className="space-y-1 pt-1">
                  {lastExportResult.warnings.map((w, i) => (
                    <p
                      key={i}
                      className="flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-400"
                    >
                      <AlertTriangleIcon className="size-3" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {exportMutation.isError && (
            <p className="text-sm text-destructive">
              {exportMutation.error.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
        </CardHeader>
        <CardContent>
          <ExportHistoryList bookId={bookId} />
        </CardContent>
      </Card>

      {/* Config Dialog */}
      <ExportConfigDialog
        bookId={bookId}
        open={configPanelOpen}
        onOpenChange={setConfigPanelOpen}
      />
    </div>
  );
}
