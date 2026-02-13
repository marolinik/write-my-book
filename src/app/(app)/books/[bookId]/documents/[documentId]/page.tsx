"use client";

import { use, useState, useEffect, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Markdown } from "tiptap-markdown";
import {
  useDocumentContent,
  useSaveDocumentContent,
} from "@/hooks/use-documents";
import { countWords } from "@/lib/utils";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { EditorStatusBar } from "@/components/editor/editor-status-bar";
import { VersionHistoryPanel } from "@/components/editor/version-history-panel";
import { VersionHistorySheet } from "@/components/editor/version-history-sheet";
import { Badge } from "@/components/ui/badge";

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

function getMarkdownFromEditor(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor.storage as any).markdown?.getMarkdown?.() ?? "";
}

const LG_BREAKPOINT = 1024;

function useIsLg() {
  const [isLg, setIsLg] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const onChange = () => setIsLg(mql.matches);
    mql.addEventListener("change", onChange);
    setIsLg(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isLg;
}

export default function DocumentEditorPage({
  params,
}: {
  params: Promise<{ bookId: string; documentId: string }>;
}) {
  const { bookId, documentId } = use(params);

  const contentLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const isLg = useIsLg();

  const { data: docData, isLoading } = useDocumentContent(bookId, documentId);
  const saveMutation = useSaveDocumentContent(bookId, documentId);
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    editorProps: {
      attributes: {
        class: `tiptap max-w-[680px] mx-auto px-4 ${focusMode ? "focus-mode" : ""}`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = getMarkdownFromEditor(e);
      setContent(md);
      setIsDirty(true);
    },
  });

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

  // Reset content loaded flag when document changes
  useEffect(() => {
    contentLoadedRef.current = false;
  }, [bookId, documentId]);

  // Load content into editor when data arrives
  useEffect(() => {
    if (docData && editor && !contentLoadedRef.current) {
      editor.commands.setContent(docData.content || "");
      contentLoadedRef.current = true;
      setIsDirty(false);
    }
  }, [docData, editor]);

  // Auto-save with 2s debounce
  const saveContent = useCallback(async () => {
    if (!editor) return;

    const md = getMarkdownFromEditor(editor);
    setIsSaving(true);

    try {
      await saveMutationRef.current.mutateAsync(md);
      setLastSaved(new Date());
      setIsDirty(false);
      setIsSaving(false);
    } catch {
      setIsSaving(false);
    }
  }, [editor]);

  useEffect(() => {
    if (!isDirty) return;

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
  }, [isDirty, content, saveContent]);

  const wordCount = content ? countWords(content) : 0;
  const docTypeLabel = docData
    ? DOC_TYPE_LABELS[docData.type] || docData.type
    : "";
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
      {/* Main editor area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Document header */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <h1 className="text-lg font-display font-semibold">{docTitle}</h1>
          {docData && (
            <Badge variant="outline" className="text-xs">
              {docTypeLabel}
            </Badge>
          )}
        </div>

        <EditorToolbar
          editor={editor}
          focusMode={focusMode}
          onToggleFocusMode={() => setFocusMode((v) => !v)}
          showHistory={showVersionHistory}
          onToggleHistory={() => setShowVersionHistory((v) => !v)}
        />

        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>

        <EditorStatusBar
          wordCount={wordCount}
          isSaving={isSaving}
          isDirty={isDirty}
          lastSaved={lastSaved}
        />
      </div>

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
