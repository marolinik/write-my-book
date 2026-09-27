"use client";

import { countWithNoun } from "@/lib/i18n/plural";
import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { useState, useCallback, useMemo } from "react";
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
import { MAX_IMPORT_FILE_MB, partitionBySize } from "@/lib/import-export/upload-limits";
import {
  occupiedChapters,
  type ExistingChapterSummary,
} from "@/lib/import-export/import-conflicts";
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

/** The format's own name stays; what it does is a sentence. */
const FORMAT_INFO: ReadonlyArray<{
  ext: string;
  label: (t: UIStrings) => string;
  desc: (t: UIStrings) => string;
}> = [
  { ext: ".docx", label: () => "DOCX", desc: (t) => t.importExportUI.importDocxDesc },
  { ext: ".md", label: () => "Markdown", desc: (t) => t.importExportUI.importMarkdownDesc },
  {
    ext: ".txt",
    label: (t) => t.importExportUI.formatPlainText,
    desc: (t) => t.importExportUI.importTxtDesc,
  },
];

export function ImportWizard({ bookId, onComplete, autoAnalyze = true }: ImportWizardProps) {
  const { t, language } = useLanguage();
  const [phase, setPhase] = useState<WizardPhase>("upload");
  const [chapters, setChapters] = useState<PreviewChapter[]>([]);
  const [existingChapters, setExistingChapters] = useState<ExistingChapterSummary[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState(0);

  const previewMutation = useImportPreview(bookId);
  const confirmMutation = useImportConfirm(bookId);
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);

  // P6-S04: every row used to go out as `create`, which upserted over the
  // writer's edited chapters. A row that lands on an existing chapter now goes
  // out only as the writer answered it — replace or skip — and an unanswered
  // one holds the whole import back. Every other row is new, so `create`.
  const occupied = useMemo(() => occupiedChapters(existingChapters), [existingChapters]);
  const plan = chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    content: ch.content,
    action: occupied.has(ch.number) ? ch.action : ("create" as const),
  }));
  const unanswered = plan.filter((row) => row.action === undefined).length;
  const toImport = plan.flatMap((row) =>
    row.action === undefined || row.action === "skip" ? [] : [{ ...row, action: row.action }]
  );

  // P6-S01/S06: a file over the limit is held back here, with its reason in
  // the writer's language, instead of going up and coming back as a 500.
  const [oversizedNotes, setOversizedNotes] = useState<string[]>([]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const { accepted, oversized } = partitionBySize(files);
      const notes = oversized.map((f) =>
        t.importExportUI.fileTooLarge
          .replace("{size}", String(MAX_IMPORT_FILE_MB))
          .replace("{name}", f.name)
      );
      setOversizedNotes(notes);
      if (accepted.length === 0) return;

      previewMutation.mutate(accepted, {
        onSuccess: (data) => {
          setChapters(data.chapters);
          setExistingChapters(data.existingChapters ?? []);
          setWarnings([...notes, ...(data.warnings ?? [])]);
          setPhase("preview");
        },
      });
    },
    [previewMutation, t]
  );

  const handleConfirm = useCallback(() => {
    if (unanswered > 0 || toImport.length === 0) return;
    confirmMutation.mutate(toImport, {
      onSuccess: () => {
        setImportedCount(toImport.length);
        setPhase("confirm-success");

        // Auto-trigger analysis after import
        if (autoAnalyze) {
          openWithWorkflow("onboard-imported-book");
        }

        onComplete?.();
      },
    });
  }, [unanswered, toImport, confirmMutation, autoAnalyze, openWithWorkflow, onComplete]);

  const handleReset = useCallback(() => {
    setPhase("upload");
    setChapters([]);
    setExistingChapters([]);
    setWarnings([]);
    setOversizedNotes([]);
    previewMutation.reset();
    confirmMutation.reset();
  }, [previewMutation, confirmMutation]);

  return (
    <div className="space-y-4">
      {/* Phase indicator */}
      <div className="flex items-center gap-2 text-sm">
        <PhaseIndicator label={t.appUI.upload} active={phase === "upload"} done={phase !== "upload"} />
        <span className="text-muted-foreground">/</span>
        <PhaseIndicator
          label={t.appUI.previewEdit}
          active={phase === "preview"}
          done={phase === "confirm-success"}
        />
        <span className="text-muted-foreground">/</span>
        <PhaseIndicator label={t.appUI.done} active={phase === "confirm-success"} done={false} />
      </div>

      {/* Phase 1: Upload */}
      {phase === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadIcon className="size-4" />{t.importExportUI.uploadManuscript}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDropzone
              onFilesSelected={handleFilesSelected}
              disabled={previewMutation.isPending}
            />

            {previewMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />{t.importExportUI.parsingFiles}</div>
            )}

            {previewMutation.isError && (
              <div className="flex items-center gap-2 rounded bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangleIcon className="size-4" />
                {previewMutation.error.message}
              </div>
            )}

            {oversizedNotes.length > 0 && (
              <div className="space-y-1 rounded bg-destructive/10 p-3 text-sm text-destructive">
                {oversizedNotes.map((note) => (
                  <p key={note} className="flex items-center gap-2">
                    <AlertTriangleIcon className="size-4 shrink-0" />
                    {note}
                  </p>
                ))}
              </div>
            )}

            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <InfoIcon className="size-3" />{t.importExportUI.supportedFormats}</div>
              <div className="grid gap-1.5">
                {FORMAT_INFO.map((fmt) => (
                  <div key={fmt.ext} className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" className="font-mono text-[10px] px-1.5">
                      {fmt.ext}
                    </Badge>
                    <span className="text-muted-foreground">{fmt.desc(t)}</span>
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
            <CardTitle>{t.appUI.previewEditChapters}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t.importExportUI.reorderHint}</p>

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

            {unanswered > 0 && (
              <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangleIcon className="size-3" />
                {t.importExportUI.unresolvedConflicts.replace("{count}", String(unanswered))}
              </p>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" size="sm" onClick={handleReset}>{t.importExportUI.startOver}</Button>
              <Button
                onClick={handleConfirm}
                disabled={
                  confirmMutation.isPending || unanswered > 0 || toImport.length === 0
                }
              >
                {confirmMutation.isPending ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />{t.importExportUI.importing}</>
                ) : (
                  <>
                    {t.importExportUI.importChapters.replace(
                      "{countNoun}",
                      countWithNoun(
                        toImport.length,
                        t.setup.chapterOne,
                        t.setup.chapterMany,
                        { few: t.setup.chapterFew, language }
                      )
                    )}
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
              <CheckCircleIcon className="size-4 text-green-600 dark:text-green-400" />{t.importExportUI.importComplete}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t.importExportUI.importedSuccessfully.replace(
                "{countNoun}",
                countWithNoun(
                  importedCount,
                  t.setup.chapterOne,
                  t.setup.chapterMany,
                  { few: t.setup.chapterFew, language }
                )
              )}
              {autoAnalyze && t.importExportUI.analysisStartingHint}
            </p>
            <Button variant="outline" onClick={handleReset}>{t.importExportUI.importAnother}</Button>
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
