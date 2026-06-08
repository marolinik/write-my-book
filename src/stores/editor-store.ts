import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { FindingItem } from "@/hooks/use-editorial";

// ── Per-pane state (no content field — TipTap is sole source of truth) ──

export interface EditorPaneState {
  bookId: string | null;
  chapterId: string | null;
  documentId: string | null;
  chapterNumber: number | null;

  // Save state — per-pane
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;

  // UI toggles — per-pane
  focusMode: boolean;
  showFindings: boolean;
  showAnnotations: boolean;
  scrollToText: string | null;
  showFloatingInput: boolean;
  pendingInlineEditFinding: FindingItem | null;

  // Actions
  setChapter: (bookId: string, chapterId: string, chapterNumber: number) => void;
  setDocumentId: (documentId: string) => void;
  markDirty: () => void;
  markClean: () => void;
  setSaving: (saving: boolean) => void;
  setLastSaved: (date: Date) => void;
  toggleFocusMode: () => void;
  toggleFindings: () => void;
  toggleAnnotations: () => void;
  setScrollToText: (text: string | null) => void;
  toggleFloatingInput: () => void;
  setPendingInlineEditFinding: (finding: FindingItem | null) => void;
  reset: () => void;
}

type EditorPaneStore = StoreApi<EditorPaneState>;

// ── Factory ────────────────────────────────────────────────────

const initialPaneState = {
  bookId: null,
  chapterId: null,
  documentId: null,
  chapterNumber: null,
  isDirty: false,
  isSaving: false,
  lastSaved: null,
  focusMode: false,
  showFindings: false,
  showAnnotations: true,
  scrollToText: null,
  showFloatingInput: false,
  pendingInlineEditFinding: null,
};

function createEditorPaneStore(): EditorPaneStore {
  return createStore<EditorPaneState>((set) => ({
    ...initialPaneState,

    setChapter: (bookId, chapterId, chapterNumber) =>
      set({ bookId, chapterId, chapterNumber, isDirty: false }),

    setDocumentId: (documentId) => set({ documentId }),

    markDirty: () => set({ isDirty: true }),

    markClean: () => set({ isDirty: false }),

    setSaving: (isSaving) => set({ isSaving }),

    setLastSaved: (lastSaved) =>
      set({ lastSaved, isDirty: false, isSaving: false }),

    toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

    toggleFindings: () => set((s) => ({ showFindings: !s.showFindings })),

    toggleAnnotations: () =>
      set((s) => ({ showAnnotations: !s.showAnnotations })),

    setScrollToText: (text) => set({ scrollToText: text }),

    toggleFloatingInput: () =>
      set((s) => ({ showFloatingInput: !s.showFloatingInput })),

    setPendingInlineEditFinding: (finding) =>
      set({ pendingInlineEditFinding: finding }),

    reset: () => set(initialPaneState),
  }));
}

// ── Keyed store registry ──────────────────────────────────────

const paneStores = new Map<string, EditorPaneStore>();

export function getOrCreatePaneStore(paneId: string): EditorPaneStore {
  let store = paneStores.get(paneId);
  if (!store) {
    store = createEditorPaneStore();
    paneStores.set(paneId, store);
  }
  return store;
}

export function destroyPaneStore(paneId: string): void {
  const store = paneStores.get(paneId);
  if (store) {
    store.getState().reset();
    paneStores.delete(paneId);
  }
}

// ── React hook — useEditorPaneStore(paneId, selector) ─────────

export function useEditorPaneStore<T>(
  paneId: string,
  selector: (state: EditorPaneState) => T
): T {
  const store = getOrCreatePaneStore(paneId);
  return useStore(store, selector);
}

// ── Backward-compat shim (deprecated — migrate callers) ───────

export function useEditorStore<T>(
  selector: (state: EditorPaneState) => T
): T {
  return useEditorPaneStore("primary", selector);
}

// Expose getState/setState for imperative access (used by manuscript-editor for pending scroll)
useEditorStore.getState = () => getOrCreatePaneStore("primary").getState();
useEditorStore.setState = ((partial: Partial<EditorPaneState>) =>
  getOrCreatePaneStore("primary").setState(partial)) as StoreApi<EditorPaneState>["setState"];
