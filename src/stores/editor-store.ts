import { createStore, useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { FindingItem } from "@/hooks/use-editorial";

// ── Per-pane state (no content field — TipTap is sole source of truth) ──

export interface SaveConflictState {
  serverContent: string;
  serverVersion: number;
}

/** Classification of the most recent autosave failure — network-level (fetch threw) vs HTTP (server responded with an error). */
export type SaveErrorKind = "network" | "http";

export interface EditorPaneState {
  bookId: string | null;
  chapterId: string | null;
  documentId: string | null;
  chapterNumber: number | null;

  // Save state — per-pane
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;

  // Optimistic locking — per-pane
  documentVersion: number | null;
  saveConflict: SaveConflictState | null;
  /**
   * Bumped by setChapter on every (re)mount/switch. In-flight async work
   * (saves, recovery reads) captures it at dispatch and drops its result on
   * mismatch — an A→B→A chapter switch passes a chapterId-only staleness
   * check even though the pane was reloaded in between.
   */
  loadEpoch: number;

  // Offline resilience — per-pane (Tier 2.2)
  /** Kind of the last autosave failure; null when the last save succeeded (or none attempted). */
  lastSaveErrorKind: SaveErrorKind | null;
  /** Epoch ms of the last successful IndexedDB draft-buffer write; null when no draft is buffered. */
  draftSavedAt: number | null;

  // UI toggles — per-pane
  focusMode: boolean;
  focusLevel: 0 | 1 | 2 | 3;
  ghostTextEnabled: boolean;
  showFindings: boolean;
  showSeriesContext: boolean;
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
  setDocumentVersion: (version: number | null) => void;
  setSaveConflict: (conflict: SaveConflictState | null) => void;
  setLastSaveErrorKind: (kind: SaveErrorKind | null) => void;
  setDraftSavedAt: (timestamp: number | null) => void;
  toggleFocusMode: () => void;
  setFocusLevel: (level: 0 | 1 | 2 | 3) => void;
  toggleGhostText: () => void;
  toggleFindings: () => void;
  toggleSeriesContext: () => void;
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
  documentVersion: null,
  saveConflict: null,
  loadEpoch: 0,
  lastSaveErrorKind: null,
  draftSavedAt: null,
  focusMode: false,
  focusLevel: 0 as const,
  ghostTextEnabled: false,
  showFindings: false,
  showSeriesContext: false,
  showAnnotations: true,
  scrollToText: null,
  showFloatingInput: false,
  pendingInlineEditFinding: null,
};

function createEditorPaneStore(): EditorPaneStore {
  return createStore<EditorPaneState>((set) => ({
    ...initialPaneState,

    setChapter: (bookId, chapterId, chapterNumber) =>
      set((s) => ({
        bookId,
        chapterId,
        chapterNumber,
        isDirty: false,
        // An orphaned in-flight save from the previous chapter must not pin
        // the new chapter's status bar at "Saving..." / block its autosave.
        isSaving: false,
        documentVersion: null,
        saveConflict: null,
        loadEpoch: s.loadEpoch + 1,
        lastSaveErrorKind: null,
        draftSavedAt: null,
      })),

    setDocumentId: (documentId) => set({ documentId }),

    setDocumentVersion: (documentVersion) => set({ documentVersion }),

    setSaveConflict: (saveConflict) => set({ saveConflict }),

    setLastSaveErrorKind: (lastSaveErrorKind) => set({ lastSaveErrorKind }),

    setDraftSavedAt: (draftSavedAt) => set({ draftSavedAt }),

    markDirty: () => set({ isDirty: true }),

    markClean: () => set({ isDirty: false }),

    setSaving: (isSaving) => set({ isSaving }),

    setLastSaved: (lastSaved) =>
      set({ lastSaved, isDirty: false, isSaving: false }),

    toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

    setFocusLevel: (focusLevel) => set({ focusLevel }),

    toggleGhostText: () =>
      set((s) => ({ ghostTextEnabled: !s.ghostTextEnabled })),

    toggleFindings: () => set((s) => ({ showFindings: !s.showFindings })),

    toggleSeriesContext: () =>
      set((s) => ({ showSeriesContext: !s.showSeriesContext })),

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
