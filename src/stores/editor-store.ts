import { create } from "zustand";

interface EditorState {
  bookId: string | null;
  chapterId: string | null;
  documentId: string | null;
  chapterNumber: number | null;
  content: string;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  focusMode: boolean;

  setChapter: (bookId: string, chapterId: string, chapterNumber: number) => void;
  setDocumentId: (documentId: string) => void;
  setContent: (content: string) => void;
  markDirty: () => void;
  markClean: () => void;
  setSaving: (saving: boolean) => void;
  setLastSaved: (date: Date) => void;
  toggleFocusMode: () => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  bookId: null,
  chapterId: null,
  documentId: null,
  chapterNumber: null,
  content: "",
  isDirty: false,
  isSaving: false,
  lastSaved: null,
  focusMode: false,

  setChapter: (bookId, chapterId, chapterNumber) =>
    set({ bookId, chapterId, chapterNumber, isDirty: false }),

  setDocumentId: (documentId) => set({ documentId }),

  setContent: (content) => set({ content, isDirty: true }),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),

  setSaving: (isSaving) => set({ isSaving }),

  setLastSaved: (lastSaved) =>
    set({ lastSaved, isDirty: false, isSaving: false }),

  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  reset: () =>
    set({
      bookId: null,
      chapterId: null,
      documentId: null,
      chapterNumber: null,
      content: "",
      isDirty: false,
      isSaving: false,
      lastSaved: null,
      focusMode: false,
    }),
}));
