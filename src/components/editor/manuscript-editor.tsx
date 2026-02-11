"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Markdown } from "tiptap-markdown";
import { useEditorStore } from "@/stores/editor-store";
import {
  useChapterContent,
  useSaveChapterContent,
} from "@/hooks/use-documents";
import { countWords } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

function getMarkdownFromEditor(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor.storage as any).markdown?.getMarkdown?.() ?? "";
}

import { EditorToolbar } from "./editor-toolbar";
import { EditorStatusBar } from "./editor-status-bar";
import { VersionHistoryPanel } from "./version-history-panel";
import { VersionHistorySheet } from "./version-history-sheet";

interface ManuscriptEditorProps {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string;
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

export function ManuscriptEditor({
  bookId,
  chapterId,
  chapterNumber,
  chapterTitle,
}: ManuscriptEditorProps) {
  const store = useEditorStore();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentLoadedRef = useRef(false);
  const [showVersionHistory, setShowVersionHistory] = useState(true);
  const isLg = useIsLg();

  const { data: chapterData, isLoading } = useChapterContent(
    bookId,
    chapterId
  );

  const saveMutation = useSaveChapterContent(bookId, chapterId);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Placeholder.configure({
        placeholder: "Start writing your chapter...",
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
        class: `tiptap max-w-[680px] mx-auto px-4 ${store.focusMode ? "focus-mode" : ""}`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const md = getMarkdownFromEditor(e);
      store.setContent(md);
    },
  });

  // Update editor class when focus mode changes
  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: {
            class: `tiptap max-w-[680px] mx-auto px-4 ${store.focusMode ? "focus-mode" : ""}`,
          },
        },
      });
    }
  }, [editor, store.focusMode]);

  // Set chapter in store on mount
  useEffect(() => {
    store.setChapter(bookId, chapterId, chapterNumber);
    contentLoadedRef.current = false;
  }, [bookId, chapterId, chapterNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load content into editor when data arrives
  useEffect(() => {
    if (chapterData && editor && !contentLoadedRef.current) {
      editor.commands.setContent(chapterData.markdown || "");
      contentLoadedRef.current = true;
      store.markClean();

      if (chapterData.documentId) {
        store.setDocumentId(chapterData.documentId);
      }
    }
  }, [chapterData, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save with 2s debounce
  const saveContent = useCallback(async () => {
    if (!editor) return;

    const md = getMarkdownFromEditor(editor);
    store.setSaving(true);

    try {
      await saveMutation.mutateAsync(md);
      store.setLastSaved(new Date());
    } catch {
      store.setSaving(false);
    }
  }, [editor, saveMutation, store]);

  useEffect(() => {
    if (!store.isDirty || !store.chapterId) return;

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
  }, [store.isDirty, store.content, store.chapterId, saveContent]);

  const wordCount = store.content ? countWords(store.content) : 0;

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
        {/* Chapter header */}
        <div className="px-4 py-3 border-b">
          <h1 className="text-lg font-display font-semibold">
            Chapter {chapterNumber}
            {chapterTitle ? `: ${chapterTitle}` : ""}
          </h1>
        </div>

        <EditorToolbar
          editor={editor}
          focusMode={store.focusMode}
          onToggleFocusMode={store.toggleFocusMode}
          showHistory={showVersionHistory}
          onToggleHistory={() => setShowVersionHistory((v) => !v)}
        />

        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>

        <EditorStatusBar
          wordCount={wordCount}
          isSaving={store.isSaving}
          isDirty={store.isDirty}
          lastSaved={store.lastSaved}
        />
      </div>

      {/* Version history sidebar — inline on lg+, Sheet on smaller screens */}
      {isLg ? (
        showVersionHistory && (
          <div className="w-64 border-l flex flex-col">
            <VersionHistoryPanel
              bookId={bookId}
              documentId={store.documentId}
            />
          </div>
        )
      ) : (
        <VersionHistorySheet
          open={showVersionHistory}
          onOpenChange={setShowVersionHistory}
          bookId={bookId}
          documentId={store.documentId}
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
