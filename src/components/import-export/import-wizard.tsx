"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "./file-dropzone";
import {
  ChapterPreviewList,
  type PreviewChapter,
} from "./chapter-preview-list";
import { useImportPreview, useImportConfirm } from "@/hooks/use-import";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import {
  CheckCircleIcon,
  Loader2Icon,
  AlertTriangleIcon,
  InfoIcon,
  UploadIcon,
  ArrowRightIcon,
} from "lucide-react";

interface ImportWizardProps {
  bookId: string;
  /** Called after successful import confirm. */
  onComplete?: () => void;
  /** Whether to auto-start analysis after import. */
  autoAnalyze?: boolean;
}

type WizardPhase = "upload" | "preview" | "confirm-success";

const FORMAT_INFO = [
  { ext: ".docx", label: "DOCX", desc: "Best chapter detection. Preserves formatting." },
  { ext: ".md", label: "Markdown", desc: "Native format. Chapter headings detected automatically." },
  { ext: ".txt", label: "Plain Text", desc: "Chapters split by blank-line separators or headings." },
];

export function ImportWizard({ bookId, onComplete, autoAnalyze = true }: ImportWizardProps) {
  const [phase, setPhase] = useState<WizardPhase>("upload");
  const [chapters, setChapters] = useState<PreviewChapter[]>([]);
  const [existingChapters, setExistingChapters] = useState<
    Array<{ number: number; title: string | null; wordCount: number }>
  >([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const previewMutation = useImportPreview(bookId);
  const confirmMutation = useImportConfirm(bookId);
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      previewMutation.mutate(files, {
        onSuccess: (data) => {
          setChapters(
            data.chapters.map((ch) => ({
              ...ch,
              action: "create" as const,
            }))
          );
          setExistingChapters(data.existingChapters ?? []);
          setWarnings(data.warnings ?? []);
          setPhase("preview");
        },
      });
    },
    [previewMutation]
  );

  const handleConfirm = useCallback(() => {
    const toImport = chapters.map((ch) => ({
      number: ch.number,
      title: ch.title,
      content: ch.content,
      action: ch.action ?? ("create" as const),
    }));

    confirmMutation.mutate(toImport, {
      onSuccess: () => {
        setPhase("confirm-success");

        // Auto-trigger analysis after import
        if (autoAnalyze) {
          openWithWorkflow("onboard-imported-book");
        }

        onComplete?.();
      },
    });
  }, [chapters, confirmMutation, autoAnalyze, openWithWorkflow, onComplete]);

  const handleReset = useCallback(() => {
    setPhase("upload");
    setChapters([]);
    setExistingChapters([]);
    setWarnings([]);
    previewMutation.reset();
    confirmMutation.reset();
  }, [previewMutation, confirmMutation]);

  return (
    <div className="space-y-4">
      {/* Phase indicator */}
      <div className="flex items-center gap-2 text-sm">
        <PhaseIndicator label="Upload" active={phase === "upload"} done={phase !== "upload"} />
        <span className="text-muted-foreground">/</span>
        <PhaseIndicator
          label="Preview & Edit"
          active={phase === "preview"}
          done={phase === "confirm-success"}
        />
        <span className="text-muted-foreground">/</span>
        <PhaseIndicator label="Done" active={phase === "confirm-success"} done={false} />
      </div>

      {/* Phase 1: Upload */}
      {phase === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadIcon className="size-4" />
              Upload Manuscript
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDropzone
              onFilesSelected={handleFilesSelected}
              disabled={previewMutation.isPending}
            />

            {previewMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Parsing files and detecting chapters...
              </div>
            )}

            {previewMutation.isError && (
              <div className="flex items-center gap-2 rounded bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangleIcon className="size-4" />
                {previewMutation.error.message}
              </div>
            )}

            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <InfoIcon className="size-3" />
                Supported formats
              </div>
              <div className="grid gap-1.5">
                {FORMAT_INFO.map((fmt) => (
                  <div key={fmt.ext} className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" className="font-mono text-[10px] px-1.5">
                      {fmt.ext}
                    </Badge>
                    <span className="text-muted-foreground">{fmt.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase 2: Preview & Edit */}
      {phase === "preview" && (
        <Card>
          <CardHeader>
            <CardTitle>Preview & Edit Chapters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Drag to reorder, click titles to rename, select multiple to merge, or remove unwanted chapters.
            </p>

            <ChapterPreviewList
              chapters={chapters}
              onChange={setChapters}
              existingChapters={existingChapters}
            />

            {warnings.length > 0 && (
              <div className="space-y-1">
                {warnings.map((w, i) => (
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

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleReset}>
                Start Over
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={confirmMutation.isPending || chapters.length === 0}
              >
                {confirmMutation.isPending ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    Import {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
                    <ArrowRightIcon className="ml-1 size-4" />
                  </>
                )}
              </Button>
            </div>

            {confirmMutation.isError && (
              <div className="flex items-center gap-2 rounded bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangleIcon className="size-4" />
                {confirmMutation.error.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Phase 3: Success */}
      {phase === "confirm-success" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircleIcon className="size-4 text-green-600 dark:text-green-400" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {chapters.length} chapter{chapters.length !== 1 ? "s" : ""} imported successfully.
              {autoAnalyze && " Analysis is starting automatically in the agent panel."}
            </p>
            <Button variant="outline" onClick={handleReset}>
              Import Another File
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PhaseIndicator({
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
