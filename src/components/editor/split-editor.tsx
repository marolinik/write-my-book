"use client";

import { useEffect } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useActiveEditorStore } from "@/stores/active-editor-store";
import { destroyPaneStore } from "@/stores/editor-store";
import { SplitChapterPicker } from "./split-chapter-picker";
import { ManuscriptEditor } from "./manuscript-editor";

interface SplitEditorProps {
  bookId: string;
  primaryChapterId: string;
  primaryChapterNumber: number;
  primaryChapterTitle?: string;
  primaryChapterStatus?: string;
  bookName: string;
  bookLanguage?: string;
  allChapters: Array<{
    id: string;
    chapterNumber: number;
    title: string | null;
    status: string;
  }>;
  children: React.ReactNode;
}

export function SplitEditor({
  bookId,
  primaryChapterId,
  bookName,
  bookLanguage,
  allChapters,
  children,
}: SplitEditorProps) {
  const splitMode = useActiveEditorStore((s) => s.splitMode);
  const secondaryChapterId = useActiveEditorStore((s) => s.secondaryChapterId);
  const setSecondaryChapter = useActiveEditorStore((s) => s.setSecondaryChapter);

  // Destroy secondary pane store when split mode is turned off or on unmount
  useEffect(() => {
    if (!splitMode) {
      destroyPaneStore("secondary");
    }
    return () => {
      destroyPaneStore("secondary");
    };
  }, [splitMode]);

  if (!splitMode) {
    return <>{children}</>;
  }

  const secondaryChapter = allChapters.find(
    (ch) => ch.id === secondaryChapterId
  );

  return (
    <ResizablePanelGroup orientation="horizontal" id="split-editor">
      <ResizablePanel id="primary" defaultSize={50} minSize={30}>
        {children}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="secondary" defaultSize={50} minSize={30}>
        <div className="flex flex-col h-full">
          <SplitChapterPicker
            chapters={allChapters}
            excludeChapterId={primaryChapterId}
            value={secondaryChapterId}
            onChange={setSecondaryChapter}
          />
          {secondaryChapterId && secondaryChapter ? (
            <ManuscriptEditor
              bookId={bookId}
              chapterId={secondaryChapterId}
              chapterNumber={secondaryChapter.chapterNumber}
              chapterTitle={secondaryChapter.title ?? undefined}
              chapterStatus={secondaryChapter.status}
              bookName={bookName}
              bookLanguage={bookLanguage}
              allChapters={allChapters}
              paneId="secondary"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a chapter to view
            </div>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
