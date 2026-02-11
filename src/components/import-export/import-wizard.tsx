"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "./file-dropzone";
import { ChapterPreviewList } from "./chapter-preview-list";
import { useExportStore } from "@/stores/export-store";
import { useImportManuscript } from "@/hooks/use-import";
import { CheckCircleIcon, Loader2Icon, AlertTriangleIcon } from "lucide-react";

interface ImportWizardProps {
  bookId: string;
}

export function ImportWizard({ bookId }: ImportWizardProps) {
  const {
    importWizard,
    setImportStep,
    setImportFiles,
    setImportResult,
    resetImport,
  } = useExportStore();
  const importMutation = useImportManuscript(bookId);

  const { step, files, result } = importWizard;

  const handleFilesSelected = (selected: File[]) => {
    setImportFiles(selected);
    setImportStep("analysis");
    // Start upload immediately
    importMutation.mutate(selected, {
      onSuccess: (data) => {
        setImportResult(data);
        setImportStep("review");
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        <StepIndicator
          label="Upload"
          active={step === "upload"}
          done={step !== "upload"}
        />
        <span className="text-muted-foreground">/</span>
        <StepIndicator
          label="Analysis"
          active={step === "analysis"}
          done={step === "review"}
        />
        <span className="text-muted-foreground">/</span>
        <StepIndicator label="Review" active={step === "review"} done={false} />
      </div>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Manuscript</CardTitle>
          </CardHeader>
          <CardContent>
            <FileDropzone onFilesSelected={handleFilesSelected} />
          </CardContent>
        </Card>
      )}

      {/* Step 2: Analysis (uploading + parsing) */}
      {step === "analysis" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2Icon className="size-4 animate-spin" />
              Analyzing Manuscript
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Uploading and detecting chapters in{" "}
              {files.map((f) => f.name).join(", ")}...
            </p>
            {importMutation.isError && (
              <div className="flex items-center gap-2 rounded bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangleIcon className="size-4" />
                {importMutation.error.message}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={resetImport}
                >
                  Try Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === "review" && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircleIcon className="size-4 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChapterPreviewList
              chapters={result.chapters}
              totalWordCount={result.totalWordCount}
            />

            {result.warnings && result.warnings.length > 0 && (
              <div className="space-y-1">
                {result.warnings.map((w, i) => (
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

            <Button variant="outline" onClick={resetImport}>
              Import Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <Badge variant={active ? "default" : done ? "secondary" : "outline"}>
      {label}
    </Badge>
  );
}
