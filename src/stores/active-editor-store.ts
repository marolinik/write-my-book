import { create } from "zustand";

/**
 * Thin global store for the active editor context.
 *
 * The primary ManuscriptEditor pane syncs bookId/chapterId/chapterNumber/documentId
 * here on chapter load. usePageContext reads from this store so the agent system
 * always knows which chapter the user is viewing — without coupling to the per-pane
 * editor store.
 *
 * Split mode state (splitMode, secondaryChapterId) also lives here because it is a
 * view-level concern, not a per-pane concern.
 */

interface ActiveEditorState {
  // Active editor context (synced by primary pane)
  bookId: string | null;
  chapterId: string | null;
  chapterNumber: number | null;
  documentId: string | null;

  // Split view state (view-level)
  splitMode: boolean;
  secondaryChapterId: string | null;

  // Actions
  setActiveEditor: (
    bookId: string,
    chapterId: string,
    chapterNumber: number
  ) => void;
  setActiveDocumentId: (documentId: string) => void;
  setSplitMode: (split: boolean) => void;
  setSecondaryChapter: (chapterId: string | null) => void;
  clearActiveEditor: () => void;
}

export const useActiveEditorStore = create<ActiveEditorState>((set) => ({
  bookId: null,
  chapterId: null,
  chapterNumber: null,
  documentId: null,
  splitMode: false,
  secondaryChapterId: null,

  setActiveEditor: (bookId, chapterId, chapterNumber) =>
    set({ bookId, chapterId, chapterNumber }),

  setActiveDocumentId: (documentId) => set({ documentId }),

  setSplitMode: (split) =>
    set({ splitMode: split, secondaryChapterId: split ? null : null }),

  setSecondaryChapter: (chapterId) => set({ secondaryChapterId: chapterId }),

  clearActiveEditor: () =>
    set({
      bookId: null,
      chapterId: null,
      chapterNumber: null,
      documentId: null,
      splitMode: false,
      secondaryChapterId: null,
    }),
}));
