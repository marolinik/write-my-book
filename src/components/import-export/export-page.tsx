"use client";

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
import { useExportManuscript } from "@/hooks/use-export";
import {
  Loader2Icon,
  SettingsIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
} from "lucide-react";

interface ExportPageProps {
  bookId: string;
}

export function ExportPage({ bookId }: ExportPageProps) {
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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

          {/* Result */}
          {lastExportResult && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="size-4 text-green-600" />
                <span className="text-sm font-medium">Export Complete</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">
                  {lastExportResult.filename}
                </Badge>
                <Badge variant="outline">
                  {lastExportResult.wordCount.toLocaleString()} words
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
