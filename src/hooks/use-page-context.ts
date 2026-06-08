"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useActiveEditorStore } from "@/stores/active-editor-store";
import { useEditorialStore } from "@/stores/editorial-store";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import type { PageContext } from "@/lib/agents/types";

/**
 * Derives PageContext from current route, editor state, and editorial filters.
 * Mounted in (app)/layout.tsx so it runs on every app page.
 * The agent store reads this to pass to API calls → system prompt.
 */
export function usePageContext() {
  const pathname = usePathname();

  // Active editor context (synced by primary ManuscriptEditor pane)
  const editorBookId = useActiveEditorStore((s) => s.bookId);
  const editorChapterId = useActiveEditorStore((s) => s.chapterId);
  const editorChapterNumber = useActiveEditorStore((s) => s.chapterNumber);
  const editorDocumentId = useActiveEditorStore((s) => s.documentId);

  // Editorial state
  const editorialSelectedChapter = useEditorialStore((s) => s.selectedChapter);
  const editorialSelectedFinding = useEditorialStore((s) => s.selectedFindingId);
  const editorialFilters = useEditorialStore((s) => s.filters);
  const editorialActiveTab = useEditorialStore((s) => s.activeTab);

  // Agent store setter
  const setPageContext = useAgentUIStore((s) => s.setPageContext);

  const pageContext = useMemo((): PageContext => {
    const ctx: PageContext = {
      currentRoute: pathname,
    };

    // Parse route segments to extract bookId/chapterId/documentId
    const segments = pathname.split("/").filter(Boolean);
    // e.g. /books/:bookId/chapters/:chapterId  →  ["books", bookId, "chapters", chapterId]
    const booksIdx = segments.indexOf("books");

    if (booksIdx >= 0 && segments.length > booksIdx + 1) {
      const chaptersIdx = segments.indexOf("chapters");
      const docsIdx = segments.indexOf("documents");
      const editorialIdx = segments.indexOf("editorial");

      // If on a chapter editor page
      if (chaptersIdx >= 0 && segments.length > chaptersIdx + 1) {
        ctx.currentChapterId = segments[chaptersIdx + 1];
        // Prefer editor store for chapter number (more reliable)
        if (editorChapterNumber) {
          ctx.currentChapterNumber = editorChapterNumber;
        }
      }

      // If on a document page
      if (docsIdx >= 0 && segments.length > docsIdx + 1) {
        ctx.currentDocumentId = segments[docsIdx + 1];
      }

      // If on editorial page, inject findings context
      if (editorialIdx >= 0) {
        ctx.activeTab = editorialActiveTab;
        ctx.findingsContext = {
          totalPending: 0, // Will be populated from use-book-state if needed
          visibleSeverities: editorialFilters.severity
            ? [editorialFilters.severity]
            : [],
          selectedFindingId: editorialSelectedFinding ?? undefined,
        };
        if (editorialSelectedChapter) {
          ctx.currentChapterNumber = editorialSelectedChapter;
        }
      }

      // Reports or style pages
      const reportsIdx = segments.indexOf("reports");
      const styleIdx = segments.indexOf("style");
      if (reportsIdx >= 0) ctx.activeTab = "reports";
      if (styleIdx >= 0) ctx.activeTab = "style";
    }

    // Overlay editor info when the editor is mounted
    if (editorChapterId) {
      ctx.currentChapterId = editorChapterId;
      if (editorChapterNumber) ctx.currentChapterNumber = editorChapterNumber;
    }
    if (editorDocumentId) {
      ctx.currentDocumentId = editorDocumentId;
    }

    return ctx;
  }, [
    pathname,
    editorChapterId,
    editorChapterNumber,
    editorDocumentId,
    editorialSelectedChapter,
    editorialSelectedFinding,
    editorialFilters.severity,
    editorialActiveTab,
  ]);

  // Write to agent store
  useEffect(() => {
    setPageContext(pageContext);
  }, [pageContext, setPageContext]);

  return pageContext;
}
