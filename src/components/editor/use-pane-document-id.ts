"use client";

import { useEffect } from "react";
import type { StoreApi } from "zustand";
import type { EditorPaneState } from "@/stores/editor-store";
import { useActiveEditorStore } from "@/stores/active-editor-store";

interface UsePaneDocumentIdOptions {
  /** The chapter's document id from the content GET (absent while empty). */
  documentId: string | undefined;
  paneStore: StoreApi<EditorPaneState>;
  /** The primary pane also publishes the id to the active-editor store. */
  isPrimary: boolean;
}

/**
 * Keeps the pane's documentId in step with the chapter-content query.
 *
 * P5-S13: the id used to be adopted inside the content-load effect, behind
 * its "initial load or clean resync" gate. A new or recreated chapter has no
 * document until its first save, and the post-save refetch that finally
 * carries the id also carries the version the save response already stamped
 * — so the gate returned early, the id was never adopted, and Version History
 * told the writer to "save content" she had just saved, until a reload. The
 * id is metadata, not content: adopting it can never clobber the writer's
 * words, so it needs no gate.
 */
export function usePaneDocumentId({
  documentId,
  paneStore,
  isPrimary,
}: UsePaneDocumentIdOptions): void {
  useEffect(() => {
    if (!documentId) return;
    if (paneStore.getState().documentId !== documentId) {
      paneStore.getState().setDocumentId(documentId);
    }
    if (isPrimary && useActiveEditorStore.getState().documentId !== documentId) {
      useActiveEditorStore.getState().setActiveDocumentId(documentId);
    }
  }, [documentId, isPrimary, paneStore]);
}
