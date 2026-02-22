"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import {
  useEditorPaneStore,
  getOrCreatePaneStore,
} from "@/stores/editor-store";
import { useActiveEditorStore } from "@/stores/active-editor-store";
import {
  useChapterContent,
  useSaveChapterContent,
} from "@/hooks/use-documents";
import { useFindings } from "@/hooks/use-editorial";
import { countWords } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InlineEditPopup } from "./inline-edit-popup";
import { EditorContextMenu } from "./editor-context-menu";
import { EditorToolbar } from "./editor-toolbar";
import { EditorStatusBar } from "./editor-status-bar";
import { VersionHistoryPanel } from "./version-history-panel";
import { VersionHistorySheet } from "./version-history-sheet";
import { EditorFindingsPanel } from "./editor-findings-panel";
import { AnnotationTooltip } from "./annotation-tooltip";
import { ChapterContextHeader } from "./chapter-context-header";
import { GutterMarkers } from "./gutter-markers";
import { FloatingAgentInput } from "./floating-agent-input";
import {
  AnnotationExtension,
  annotationPluginKey,
  countAnnotations,
  findTextPositions,
} from "./annotation-extension";
import type { AnnotationType } from "./annotation-extension";
import type { FindingItem } from "@/hooks/use-editorial";
import { useApplyFinding, useDismissFinding } from "@/hooks/use-editorial";
import { getMarkdownFromEditor, useIsLg, findingsToAnnotations, createEditorExtensions, type TooltipState } from "./editor-utils";

interface ChapterNavItem {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
}

interface ManuscriptEditorProps {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string;
  chapterStatus?: string;
  bookName?: string;
  bookLanguage?: string;
  allChapters?: ChapterNavItem[];
  paneId?: string;
}

// ── Component ────────────────────────────────────────────────

export function ManuscriptEditor({
  bookId,
  chapterId,
  chapterNumber,
  chapterTitle,
  chapterStatus,
  bookName,
  bookLanguage,
  allChapters,
  paneId = "primary",
}: ManuscriptEditorProps) {
  const isPrimary = paneId === "primary";

  // Per-pane store selectors
  const paneBookId = useEditorPaneStore(paneId, (s) => s.bookId);
  const paneChapterId = useEditorPaneStore(paneId, (s) => s.chapterId);
  const paneDocumentId = useEditorPaneStore(paneId, (s) => s.documentId);
  const isDirty = useEditorPaneStore(paneId, (s) => s.isDirty);
  const isSaving = useEditorPaneStore(paneId, (s) => s.isSaving);
  const lastSaved = useEditorPaneStore(paneId, (s) => s.lastSaved);
  const focusMode = useEditorPaneStore(paneId, (s) => s.focusMode);
  const showFindings = useEditorPaneStore(paneId, (s) => s.showFindings);
  const showAnnotations = useEditorPaneStore(paneId, (s) => s.showAnnotations);
  const showFloatingInput = useEditorPaneStore(paneId, (s) => s.showFloatingInput);

  // Per-pane store actions
  const paneStore = getOrCreatePaneStore(paneId);
  const storeActions = paneStore.getState();

  // View-level state from active-editor-store
  const splitMode = useActiveEditorStore((s) => s.splitMode);
  const setSplitMode = useActiveEditorStore((s) => s.setSplitMode);
  const isMobile = useIsMobile();
  const router = useRouter();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentLoadedRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showInlineEdit, setShowInlineEdit] = useState(false);
  const [inlineEditInstruction, setInlineEditInstruction] = useState<string | undefined>(undefined);
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
  const [showFloatingAgentInput, setShowFloatingAgentInput] = useState(false);
  const isLg = useIsLg();

  // Findings for current chapter
  const { data: findingsData } = useFindings(bookId, { chapterNumber });
  const findings = findingsData?.findings ?? [];
  const pendingFindingsCount = findings.filter(
    (f) => f.status === "pending"
  ).length;

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

  // Handle annotation click → show tooltip OR open AI rewrite for findings
  const handleAnnotationClick = useCallback(
    (
      annotationId: string,
      annotationType: AnnotationType,
      rect: DOMRect,
      _event: MouseEvent
    ) => {
      // Find the associated finding
      const findingId = annotationId.replace("finding-", "");
      const finding = findings.find((f) => f.id === findingId) ?? null;

      if (annotationType === "finding" && finding && editorRef.current) {
        // For "finding" annotations: select the text and open inline AI edit
        // with the finding's description/suggestion as context
        const ed = editorRef.current;
        const searchText =
          finding.originalText ?? finding.locationStart ?? "";
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

      // For other annotation types: show the tooltip
      setTooltipState({ annotationId, annotationType, rect, finding });
    },
    [findings]
  );

  const { data: chapterData, isLoading } = useChapterContent(
    bookId,
    chapterId
  );

  const saveMutation = useSaveChapterContent(bookId, chapterId);
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  // Prev/next chapter navigation
  const currentIdx = allChapters?.findIndex((ch) => ch.id === chapterId) ?? -1;
  const prevChapter = currentIdx > 0 ? allChapters![currentIdx - 1] : null;
  const nextChapter =
    allChapters && currentIdx >= 0 && currentIdx < allChapters.length - 1
      ? allChapters[currentIdx + 1]
      : null;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createEditorExtensions({
      placeholder: "Start writing your chapter...",
      onAnnotationClick: handleAnnotationClick,
    }),
    editorProps: {
      attributes: {
        class: `tiptap max-w-[680px] mx-auto px-4 ${focusMode ? "focus-mode" : ""}`,
      },
    },
    onUpdate: () => {
      // TipTap is sole content source — just mark dirty in the pane store
      paneStore.getState().markDirty();
    },
  });

  // Keep ref in sync so callbacks can access editor without circular deps
  editorRef.current = editor;

  // Update editor class when focus mode changes
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

  // Push annotations into the ProseMirror plugin when they change
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

  // Set chapter in pane store on mount; sync primary pane to active-editor-store
  useEffect(() => {
    paneStore.getState().setChapter(bookId, chapterId, chapterNumber);
    contentLoadedRef.current = false;
    if (isPrimary) {
      useActiveEditorStore.getState().setActiveEditor(bookId, chapterId, chapterNumber);
    }
  }, [bookId, chapterId, chapterNumber, isPrimary, paneStore]);

  // Load content into editor when data arrives
  useEffect(() => {
    if (chapterData && editor && !contentLoadedRef.current) {
      editor.commands.setContent(chapterData.markdown || "");
      contentLoadedRef.current = true;
      paneStore.getState().markClean();

      if (chapterData.documentId) {
        paneStore.getState().setDocumentId(chapterData.documentId);
        if (isPrimary) {
          useActiveEditorStore.getState().setActiveDocumentId(chapterData.documentId);
        }
      }

      // If scrollToText was set before content loaded (e.g. navigating from editorial page),
      // trigger it now by re-setting the same value so the subscriber picks it up.
      const pendingScroll = paneStore.getState().scrollToText;
      if (pendingScroll) {
        // Small delay to let annotations render first
        setTimeout(() => paneStore.getState().setScrollToText(pendingScroll), 150);
      }
    }
  }, [chapterData, editor, isPrimary, paneStore]);

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
    if (!isDirty || !paneChapterId) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveContent();
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [isDirty, paneChapterId, saveContent]);

  // F2 shortcut: open inline AI edit when text is selected
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2" && !showInlineEdit) {
        e.preventDefault();
        const { from, to } = editor.state.selection;
        if (from === to) {
          toast.info("Select some text first, then press F2.");
          return;
        }
        setInlineEditInstruction(undefined);
        setShowInlineEdit(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, showInlineEdit]);

  // Watch for finding-card clicks → open inline edit popup
  const pendingInlineEditFinding = useEditorPaneStore(paneId, (s) => s.pendingInlineEditFinding);

  useEffect(() => {
    if (!pendingInlineEditFinding || !editor) return;

    const finding = pendingInlineEditFinding;
    // Clear immediately to avoid re-triggering
    paneStore.getState().setPendingInlineEditFinding(null);

    // Small delay to let scrollToText complete first
    setTimeout(() => {
      const searchText = finding.originalText ?? finding.locationStart ?? "";
      if (searchText) {
        const positions = findTextPositions(editor.state.doc, searchText);
        if (positions.length > 0) {
          editor.commands.setTextSelection(positions[0]);
        }
      }
      const instruction = finding.suggestion ?? finding.description;
      setInlineEditInstruction(instruction);
      setShowInlineEdit(true);
    }, 200);
  }, [pendingInlineEditFinding, editor, paneStore]);

  // "Show in text" — scrollToText subscriber from pane store
  const scrollToText = useEditorPaneStore(paneId, (s) => s.scrollToText);

  useEffect(() => {
    if (!scrollToText || !editor) return;

    const positions = findTextPositions(editor.state.doc, scrollToText);
    if (positions.length > 0) {
      const pos = positions[0];
      editor.commands.setTextSelection(pos);
      editor.commands.scrollIntoView();

      // Flash highlight
      requestAnimationFrame(() => {
        const decorations = editor.view.dom.querySelectorAll(
          `[data-annotation-id]`
        );
        // Also try to find the element at the selection
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

  // Show floating agent input when text is selected (not during inline edit)
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const { from, to } = editor.state.selection;
      setShowFloatingAgentInput(from !== to);
    };
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor]);

  // Word count — get content directly from editor, not store (TipTap is source of truth)
  const wordCount = editor ? countWords(getMarkdownFromEditor(editor)) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading chapter...
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main editor area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Breadcrumb + nav header */}
        <div className="px-4 py-3 border-b space-y-1">
          {/* Breadcrumb trail */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => router.push(`/books/${bookId}`)}
              title="Back to book"
            >
              <ArrowLeftIcon className="size-3.5" />
            </Button>
            <Link
              href={`/books/${bookId}`}
              className="hover:text-foreground transition-colors truncate"
            >
              {bookName ?? "Book"}
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium truncate">
              Ch. {chapterNumber}
              {chapterTitle ? `: ${chapterTitle}` : ""}
            </span>
          </div>

          {/* Chapter title + prev/next */}
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-display font-semibold flex-1 min-w-0 truncate">
              Chapter {chapterNumber}
              {chapterTitle ? `: ${chapterTitle}` : ""}
            </h1>

            {allChapters && allChapters.length > 1 && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!prevChapter}
                  onClick={() =>
                    prevChapter &&
                    router.push(`/books/${bookId}/chapters/${prevChapter.id}`)
                  }
                  title={
                    prevChapter
                      ? `Ch. ${prevChapter.chapterNumber}${prevChapter.title ? `: ${prevChapter.title}` : ""}`
                      : "No previous chapter"
                  }
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {currentIdx + 1}/{allChapters.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!nextChapter}
                  onClick={() =>
                    nextChapter &&
                    router.push(`/books/${bookId}/chapters/${nextChapter.id}`)
                  }
                  title={
                    nextChapter
                      ? `Ch. ${nextChapter.chapterNumber}${nextChapter.title ? `: ${nextChapter.title}` : ""}`
                      : "No next chapter"
                  }
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {chapterStatus && (
          <ChapterContextHeader
            chapterNumber={chapterNumber}
            chapterTitle={chapterTitle}
            status={chapterStatus}
            wordCount={wordCount}
            language={bookLanguage}
          />
        )}

        <EditorToolbar
          editor={editor}
          focusMode={focusMode}
          onToggleFocusMode={() => paneStore.getState().toggleFocusMode()}
          showHistory={showVersionHistory}
          onToggleHistory={() => setShowVersionHistory((v) => !v)}
          showFindings={showFindings}
          onToggleFindings={() => paneStore.getState().toggleFindings()}
          pendingFindingsCount={pendingFindingsCount}
          showAnnotations={showAnnotations}
          onToggleAnnotations={() => paneStore.getState().toggleAnnotations()}
          isSaving={isSaving}
          isDirty={isDirty}
          lastSaved={lastSaved}
          onInlineEdit={() => {
            if (!editor) return;
            const { from, to } = editor.state.selection;
            if (from === to) {
              toast.info("Select some text first, then press F2 or click AI Rewrite.");
              return;
            }
            setInlineEditInstruction(undefined);
            setShowInlineEdit(true);
          }}
          splitMode={splitMode}
          onToggleSplit={
            isMobile ? undefined : () => setSplitMode(!splitMode)
          }
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
            <GutterMarkers
              editor={editor}
              findings={findings}
              visible={showAnnotations}
              onMarkerClick={(findingId, rect) => {
                const finding = findings.find((f) => f.id === findingId) ?? null;
                if (finding) {
                  setTooltipState({
                    annotationId: `finding-${findingId}`,
                    annotationType: finding.newText ? "ai" : "comment",
                    rect,
                    finding,
                  });
                }
              }}
            />
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
                description={
                  tooltipState.finding?.description ?? "Annotation"
                }
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
                    dismissMutation.mutate({
                      findingId: tooltipState.finding.id,
                    });
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

      {/* Findings panel — inline on lg+ */}
      {isLg
        ? showFindings && (
            <div className="w-80 border-l flex flex-col shrink-0">
              <EditorFindingsPanel
                bookId={bookId}
                chapterNumber={chapterNumber}
                onClose={() => paneStore.getState().toggleFindings()}
                paneId={paneId}
              />
            </div>
          )
        : showFindings && (
            <div className="fixed inset-y-0 right-0 w-80 z-40 border-l bg-background shadow-xl flex flex-col">
              <EditorFindingsPanel
                bookId={bookId}
                chapterNumber={chapterNumber}
                onClose={() => paneStore.getState().toggleFindings()}
                paneId={paneId}
              />
            </div>
          )}

      {/* Version history sidebar — inline on lg+, Sheet on smaller screens */}
      {isLg ? (
        showVersionHistory && (
          <div className="w-64 border-l flex flex-col">
            <VersionHistoryPanel
              bookId={bookId}
              documentId={paneDocumentId}
            />
          </div>
        )
      ) : (
        <VersionHistorySheet
          open={showVersionHistory}
          onOpenChange={setShowVersionHistory}
          bookId={bookId}
          documentId={paneDocumentId}
          documentTitle={
            chapterTitle
              ? `Chapter ${chapterNumber}: ${chapterTitle}`
              : `Chapter ${chapterNumber}`
          }
        />
      )}
    </div>
  );
}
