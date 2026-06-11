"use client";

import { useEffect } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useActiveEditorStore } from "@/stores/active-editor-store";
import { destroyPaneStore } from "@/stores/editor-store";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const setSplitMode = useActiveEditorStore((s) => s.setSplitMode);
  const secondaryChapterId = useActiveEditorStore((s) => s.secondaryChapterId);
  const setSecondaryChapter = useActiveEditorStore((s) => s.setSecondaryChapter);
  const isMobile = useIsMobile();

  // Destroy secondary pane store when split mode is turned off or on unmount
  useEffect(() => {
    if (!splitMode) {
      destroyPaneStore("secondary");
    }
    return () => {
      destroyPaneStore("secondary");
    };
  }, [splitMode]);

  // Viewport shrink with split on: turn split OFF rather than render a
  // passthrough over live state — otherwise splitMode stays true with no
  // visible affordance (the toggle is hidden on phones) and the secondary
  // pane store is stranded with whatever dirty state it held.
  useEffect(() => {
    if (isMobile && splitMode) {
      setSplitMode(false);
    }
  }, [isMobile, splitMode, setSplitMode]);

  // isMobile: render single-pane immediately while the effect above resets
  // the store (the secondary editor's unmount flushes its draft buffer).
  if (!splitMode || isMobile) {
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
