"use client";

import { use, useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import {
  useDocumentContent,
  useSaveDocumentContent,
} from "@/hooks/use-documents";
import { useFindings, useApplyFinding, useDismissFinding } from "@/hooks/use-editorial";
import { countWords } from "@/lib/utils";
import {
  useEditorPaneStore,
  getOrCreatePaneStore,
  destroyPaneStore,
} from "@/stores/editor-store";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { EditorStatusBar } from "@/components/editor/editor-status-bar";
import { EditorContextMenu } from "@/components/editor/editor-context-menu";
import { EditorFindingsPanel } from "@/components/editor/editor-findings-panel";
import { GutterMarkers } from "@/components/editor/gutter-markers";
import { InlineEditPopup } from "@/components/editor/inline-edit-popup";
import { FloatingAgentInput } from "@/components/editor/floating-agent-input";
import { AnnotationTooltip } from "@/components/editor/annotation-tooltip";
import { VersionHistoryPanel } from "@/components/editor/version-history-panel";
import { VersionHistorySheet } from "@/components/editor/version-history-sheet";
import {
  annotationPluginKey,
  countAnnotations,
  findTextPositions,
} from "@/components/editor/annotation-extension";
import type { AnnotationType } from "@/components/editor/annotation-extension";
import { getMarkdownFromEditor, useIsLg, findingsToAnnotations, createEditorExtensions, type TooltipState } from "@/components/editor/editor-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronRight,
  PanelRightIcon,
  FileTextIcon,
  ClockIcon,
  BotIcon,
  HashIcon,
} from "lucide-react";

const DOC_TYPE_LABELS: Record<string, string> = {
  CONCEPT: "Concept",
  STORY_BIBLE: "Story Bible",
  ARCHITECTURE: "Architecture",
  FINGERPRINT: "Fingerprint",
  CHAPTER_BRIEF: "Chapter Brief",
  CHAPTER_PLAN: "Chapter Plan",
  CHAPTER_CONTENT: "Chapter Content",
  DEV_EDIT_REPORT: "Dev Edit Report",
  LINE_EDIT_REPORT: "Line Edit Report",
  BETA_READ_REPORT: "Beta Read Report",
  CONTINUITY_REPORT: "Continuity Report",
  ANALYSIS_REPORT: "Analysis Report",
  MARKET_REPORT: "Market Report",
  EXPORT_CONFIG: "Export Config",
  FREEWRITE: "Freewrite",
};

const CHAPTER_DOC_TYPES = new Set([
  "CHAPTER_BRIEF",
  "CHAPTER_PLAN",
  "CHAPTER_CONTENT",
  "DEV_EDIT_REPORT",
  "LINE_EDIT_REPORT",
  "BETA_READ_REPORT",
]);

// ── Component ────────────────────────────────────────────────

export default function DocumentEditorPage({
  params,
}: {
  params: Promise<{ bookId: string; documentId: string }>;
}) {
  const { bookId, documentId } = use(params);

  const PANE_ID = "doc-editor";
  const paneStore = getOrCreatePaneStore(PANE_ID);

  // Per-pane store selectors
  const isDirty = useEditorPaneStore(PANE_ID, (s) => s.isDirty);
  const isSaving = useEditorPaneStore(PANE_ID, (s) => s.isSaving);
  const lastSaved = useEditorPaneStore(PANE_ID, (s) => s.lastSaved);
  const focusMode = useEditorPaneStore(PANE_ID, (s) => s.focusMode);
  const showAnnotations = useEditorPaneStore(PANE_ID, (s) => s.showAnnotations);
  const showFindings = useEditorPaneStore(PANE_ID, (s) => s.showFindings);
  const showFloatingInput = useEditorPaneStore(PANE_ID, (s) => s.showFloatingInput);

  const contentLoadedRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [content, setContent] = useState("");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showInlineEdit, setShowInlineEdit] = useState(false);
  const [inlineEditInstruction, setInlineEditInstruction] = useState<string | undefined>(undefined);
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
  const [showFloatingAgentInput, setShowFloatingAgentInput] = useState(false);

  // Destroy pane store on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      destroyPaneStore(PANE_ID);
    };
  }, []);
  const isLg = useIsLg();

  const { data: docData, isLoading } = useDocumentContent(bookId, documentId);
  const saveMutation = useSaveDocumentContent(bookId, documentId);
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  // Chapter-scoped?
  const isChapterScoped = docData ? CHAPTER_DOC_TYPES.has(docData.type) : false;
  const chapterNumber = docData?.chapterNumber ?? null;

  // Findings for chapter-scoped documents
  const { data: findingsData } = useFindings(
    bookId,
    chapterNumber ? { chapterNumber } : {}
  );
  const findings = useMemo(
    () => (isChapterScoped ? (findingsData?.findings ?? []) : []),
    [findingsData?.findings, isChapterScoped]
  );
  const pendingFindingsCount = useMemo(
    () => findings.filter((f) => f.status === "pending").length,
    [findings]
  );

  // Auto-open findings panel when pending findings exist
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (pendingFindingsCount > 0 && !autoOpenedRef.current && !showFindings) {
      paneStore.getState().toggleFindings();
      autoOpenedRef.current = true;
    }
  }, [pendingFindingsCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutations for tooltip accept/reject
  const applyMutation = useApplyFinding(bookId);
  const dismissMutation = useDismissFinding(bookId);

  // Build annotations from findings
  const annotations = useMemo(
    () => (showAnnotations ? findingsToAnnotations(findings) : []),
    [findings, showAnnotations]
  );

  const annotationCounts = useMemo(
    () => (showAnnotations ? countAnnotations(annotations) : null),
    [annotations, showAnnotations]
  );

  // Load all documents for chapter navigation
  const { data: allDocs } = useQuery({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: !!bookId && isChapterScoped,
  });

  // Find prev/next chapter docs of same type
  const siblingDocs = useMemo(() => {
    if (!isChapterScoped || !docData || !allDocs) return { prev: null, next: null };
    const docs = allDocs?.documents ?? allDocs ?? [];
    const sameType = docs
      .filter((d: { type: string; chapterNumber?: number | null }) => d.type === docData.type && d.chapterNumber)
      .sort((a: { chapterNumber: number }, b: { chapterNumber: number }) => a.chapterNumber - b.chapterNumber);

    const currentIdx = sameType.findIndex((d: { id: string }) => d.id === documentId);
    return {
      prev: currentIdx > 0 ? sameType[currentIdx - 1] : null,
      next: currentIdx < sameType.length - 1 ? sameType[currentIdx + 1] : null,
    };
  }, [allDocs, docData, documentId, isChapterScoped]);

  // Handle annotation click (accepts arrays for overlapping annotation support)
  const handleAnnotationClick = useCallback(
    (
      annotationIds: string[],
      annotationTypes: AnnotationType[],
      rect: DOMRect
    ) => {
      const annotationId = annotationIds[0];
      const annotationType = annotationTypes[0];
      if (!annotationId) return;

      const findingId = annotationId.replace("finding-", "");
      const finding = findings.find((f) => f.id === findingId) ?? null;

      if (annotationType === "finding" && finding && editorRef.current) {
        const ed = editorRef.current;
        const searchText = finding.originalText ?? finding.locationStart ?? "";
        if (searchText) {
          const positions = findTextPositions(ed.state.doc, searchText);
          if (positions.length > 0) {
            ed.commands.setTextSelection(positions[0]);
          }
        }
        const instruction = finding.suggestion ?? finding.description;
        setInlineEditInstruction(instruction);
        setShowInlineEdit(true);
        return;
      }

      setTooltipState({ annotationId, annotationType, rect, finding });
    },
    [findings]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createEditorExtensions({
      placeholder: "Start writing...",
      onAnnotationClick: handleAnnotationClick,
    }),
    editorProps: {
      attributes: {
        class: `tiptap max-w-[680px] mx-auto px-4 ${focusMode ? "focus-mode" : ""}`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = getMarkdownFromEditor(e);
      setContent(md);
      paneStore.getState().markDirty();
    },
  });

  // Keep ref in sync
  editorRef.current = editor;

  // Update focus mode class
  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `tiptap max-w-[680px] mx-auto px-4 ${focusMode ? "focus-mode" : ""}`,
          },
        },
      });
    }
  }, [editor, focusMode]);

  // Push annotations into the ProseMirror plugin
  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr.setMeta(annotationPluginKey, { annotations });
    editor.view.dispatch(tr);
  }, [editor, annotations]);

  // Toggle annotation visibility
  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr.setMeta(annotationPluginKey, {
      enabled: showAnnotations,
    });
    editor.view.dispatch(tr);
  }, [editor, showAnnotations]);

  // Reset on doc change
  useEffect(() => {
    contentLoadedRef.current = false;
  }, [bookId, documentId]);

  // Load content
  useEffect(() => {
    if (docData && editor && !contentLoadedRef.current) {
      editor.commands.setContent(docData.content || "");
      contentLoadedRef.current = true;
      paneStore.getState().markClean();
    }
  }, [docData, editor, paneStore]);

  // Auto-save with 2s debounce
  const saveContent = useCallback(async () => {
    if (!editor) return;
    const md = getMarkdownFromEditor(editor);
    paneStore.getState().setSaving(true);
    try {
      await saveMutationRef.current.mutateAsync(md);
      paneStore.getState().setLastSaved(new Date());
    } catch {
      paneStore.getState().setSaving(false);
    }
  }, [editor, paneStore]);

  useEffect(() => {
    if (!isDirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveContent(), 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isDirty, content, saveContent]);

  // F2 shortcut
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2" && !showInlineEdit) {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          e.preventDefault();
          setInlineEditInstruction(undefined);
          setShowInlineEdit(true);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, showInlineEdit]);

  // "Show in text" subscriber
  const scrollToText = useEditorPaneStore(PANE_ID, (s) => s.scrollToText);

  useEffect(() => {
    if (!scrollToText || !editor) return;

    const positions = findTextPositions(editor.state.doc, scrollToText);
    if (positions.length > 0) {
      const pos = positions[0];
      editor.commands.setTextSelection(pos);
      editor.commands.scrollIntoView();

      requestAnimationFrame(() => {
        const domAtPos = editor.view.domAtPos(pos.from);
        const targetNode = domAtPos.node.parentElement;
        if (targetNode) {
          targetNode.classList.add("anno-flash");
          setTimeout(() => targetNode.classList.remove("anno-flash"), 2000);
        }
      });
    }

    paneStore.getState().setScrollToText(null);
  }, [scrollToText, editor, paneStore]);

  // Floating agent input on selection
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const { from, to } = editor.state.selection;
      setShowFloatingAgentInput(from !== to);
    };
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor]);

  const wordCount = content ? countWords(content) : 0;
  const docTypeLabel = docData ? DOC_TYPE_LABELS[docData.type] || docData.type : "";
  const docTitle = docData?.title || docTypeLabel;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading document...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Breadcrumb Navigation */}
        <div className="px-4 py-2 border-b flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/30">
          <Link href={`/books/${bookId}/library`} className="hover:text-foreground transition-colors">
            Library
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground font-medium truncate">{docTitle}</span>
          <ChevronRight className="size-3.5" />
          <span>v{docData?.currentVersion ?? 1}</span>
        </div>

        {/* Document header */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <h1 className="text-lg font-display font-semibold">{docTitle}</h1>
          {docData && (
            <Badge variant="outline" className="text-xs">
              {docTypeLabel}
            </Badge>
          )}
          {chapterNumber && (
            <Badge variant="secondary" className="text-xs">
              Ch. {chapterNumber}
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-1">
            {isChapterScoped && (
              <div className="flex items-center gap-0.5 mr-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!siblingDocs.prev}
                  asChild={!!siblingDocs.prev}
                >
                  {siblingDocs.prev ? (
                    <Link href={`/books/${bookId}/documents/${siblingDocs.prev.id}`}>
                      <ChevronLeftIcon className="size-4" />
                    </Link>
                  ) : (
                    <span><ChevronLeftIcon className="size-4" /></span>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground px-1">
                  Ch. {chapterNumber}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!siblingDocs.next}
                  asChild={!!siblingDocs.next}
                >
                  {siblingDocs.next ? (
                    <Link href={`/books/${bookId}/documents/${siblingDocs.next.id}`}>
                      <ChevronRightIcon className="size-4" />
                    </Link>
                  ) : (
                    <span><ChevronRightIcon className="size-4" /></span>
                  )}
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setShowMetadata((v) => !v)}
              title="Document metadata"
            >
              <PanelRightIcon className="size-4" />
            </Button>
          </div>
        </div>

        <EditorToolbar
          editor={editor}
          focusMode={focusMode}
          onToggleFocusMode={() => paneStore.getState().toggleFocusMode()}
          showHistory={showVersionHistory}
          onToggleHistory={() => setShowVersionHistory((v) => !v)}
          showFindings={showFindings}
          onToggleFindings={isChapterScoped ? () => paneStore.getState().toggleFindings() : undefined}
          pendingFindingsCount={pendingFindingsCount}
          showAnnotations={showAnnotations}
          onToggleAnnotations={isChapterScoped ? () => paneStore.getState().toggleAnnotations() : undefined}
          isSaving={isSaving}
          isDirty={isDirty}
          lastSaved={lastSaved}
          onInlineEdit={() => {
            if (!editor) return;
            const { from, to } = editor.state.selection;
            if (from !== to) {
              setInlineEditInstruction(undefined);
              setShowInlineEdit(true);
            }
          }}
          showFloatingInput={showFloatingInput}
          onToggleFloatingInput={() => paneStore.getState().toggleFloatingInput()}
        />

        <EditorContextMenu
          bookId={bookId}
          editor={editor}
          onInlineEdit={(instruction) => {
            if (!editor) return;
            const { from, to } = editor.state.selection;
            if (from === to) return;
            setInlineEditInstruction(instruction);
            setShowInlineEdit(true);
          }}
        >
          <div className="flex-1 overflow-y-auto relative" ref={editorAreaRef}>
            {isChapterScoped && (
              <GutterMarkers
                editor={editor}
                findings={findings}
                visible={showAnnotations}
                onMarkerClick={(findingId, rect) => {
                  const finding = findings.find((f) => f.id === findingId) ?? null;
                  if (finding) {
                    setTooltipState({
                      annotationId: `finding-${findingId}`,
                      annotationType: finding.newText ? "ai" : "finding",
                      rect,
                      finding,
                    });
                  }
                }}
              />
            )}
            <EditorContent editor={editor} />
            {showFloatingAgentInput &&
              showFloatingInput &&
              !showInlineEdit &&
              editor && (
                <FloatingAgentInput
                  editor={editor}
                  bookId={bookId}
                  onClose={() => setShowFloatingAgentInput(false)}
                />
              )}
            {showInlineEdit && editor && (
              <InlineEditPopup
                editor={editor}
                bookId={bookId}
                onClose={() => {
                  setShowInlineEdit(false);
                  setInlineEditInstruction(undefined);
                }}
                initialInstruction={inlineEditInstruction}
              />
            )}
            {tooltipState && editorAreaRef.current && (
              <AnnotationTooltip
                annotationId={tooltipState.annotationId}
                annotationType={tooltipState.annotationType}
                description={tooltipState.finding?.description ?? "Annotation"}
                originalText={tooltipState.finding?.originalText}
                newText={tooltipState.finding?.newText}
                anchorRect={tooltipState.rect}
                containerRect={editorAreaRef.current.getBoundingClientRect()}
                onAccept={() => {
                  if (tooltipState.finding) {
                    applyMutation.mutate(tooltipState.finding.id);
                  }
                  setTooltipState(null);
                }}
                onReject={() => {
                  if (tooltipState.finding) {
                    dismissMutation.mutate({ findingId: tooltipState.finding.id });
                  }
                  setTooltipState(null);
                }}
                onClose={() => setTooltipState(null)}
              />
            )}
          </div>
        </EditorContextMenu>

        <EditorStatusBar
          wordCount={wordCount}
          isSaving={isSaving}
          isDirty={isDirty}
          lastSaved={lastSaved}
          annotationCounts={annotationCounts}
        />
      </div>

      {/* Metadata panel */}
      {showMetadata && docData && (
        <div className="w-56 border-l flex flex-col bg-muted/20 p-3 space-y-4 text-xs">
          <h3 className="font-medium text-sm">Document Info</h3>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileTextIcon className="size-3" />
              <span>Type: {docTypeLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <HashIcon className="size-3" />
              <span>Version: {docData.currentVersion}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ClockIcon className="size-3" />
              <span>Modified: {docData.updatedAt ? new Date(docData.updatedAt).toLocaleDateString() : "—"}</span>
            </div>
            {docData.createdAt && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ClockIcon className="size-3" />
                <span>Created: {new Date(docData.createdAt).toLocaleDateString()}</span>
              </div>
            )}
            {docData.createdByAgent && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <BotIcon className="size-3" />
                <span>Agent: {docData.createdByAgent}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span>{wordCount.toLocaleString()} words</span>
            </div>
          </div>
        </div>
      )}

      {/* Findings panel — chapter-scoped docs only */}
      {isChapterScoped && isLg
        ? showFindings && chapterNumber && (
            <div className="w-80 border-l flex flex-col shrink-0">
              <EditorFindingsPanel
                bookId={bookId}
                chapterNumber={chapterNumber}
                onClose={() => paneStore.getState().toggleFindings()}
                paneId={PANE_ID}
              />
            </div>
          )
        : isChapterScoped && showFindings && chapterNumber && (
            <div className="fixed inset-y-0 right-0 w-80 z-40 border-l bg-background shadow-xl flex flex-col">
              <EditorFindingsPanel
                bookId={bookId}
                chapterNumber={chapterNumber}
                onClose={() => paneStore.getState().toggleFindings()}
                paneId={PANE_ID}
              />
            </div>
          )}

      {/* Version history sidebar */}
      {isLg ? (
        showVersionHistory && (
          <div className="w-64 border-l flex flex-col">
            <VersionHistoryPanel bookId={bookId} documentId={documentId} />
          </div>
        )
      ) : (
        <VersionHistorySheet
          open={showVersionHistory}
          onOpenChange={setShowVersionHistory}
          bookId={bookId}
          documentId={documentId}
          documentTitle={docTitle}
        />
      )}
    </div>
  );
}
