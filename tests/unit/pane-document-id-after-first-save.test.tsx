// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

import { usePaneDocumentId } from "@/components/editor/use-pane-document-id";
import {
  destroyPaneStore,
  getOrCreatePaneStore,
} from "@/stores/editor-store";
import { useActiveEditorStore } from "@/stores/active-editor-store";

/**
 * P5-S13 — a brand-new (or recreated) chapter showed "Save content to see
 * version history" even after the status bar said Saved, until a reload.
 *
 * The chapter's document id arrives only with the post-save content refetch
 * (the GET withholds it while the chapter is empty). The editor adopted it
 * inside the content-load effect, behind the "initial load or clean resync"
 * gate — and the refetch carries the very version the save response already
 * stamped, so the gate returned early and the pane's documentId stayed null.
 * The id is metadata, not content: it must be adopted whenever it arrives.
 */

const PANE = "pane-doc-id-test";

afterEach(() => {
  cleanup();
  destroyPaneStore(PANE);
  useActiveEditorStore.getState().clearActiveEditor();
});

describe("usePaneDocumentId", () => {
  it("adopts the document id that first appears after the first save", () => {
    const store = getOrCreatePaneStore(PANE);
    store.getState().setChapter("b1", "ch-new", 5);
    // Empty chapter: loaded with no document yet.
    const { rerender } = renderHook(
      ({ documentId }: { documentId?: string }) =>
        usePaneDocumentId({ documentId, paneStore: store, isPrimary: true }),
      { initialProps: { documentId: undefined as string | undefined } }
    );
    expect(store.getState().documentId).toBeNull();

    // The first save stamps v1 and the refetch now carries the id — with the
    // same version, which is exactly what the content-load gate skipped.
    store.getState().setDocumentVersion(1);
    rerender({ documentId: "doc-new" });

    expect(store.getState().documentId).toBe("doc-new");
    expect(useActiveEditorStore.getState().documentId).toBe("doc-new");
  });

  it("leaves the active-editor store alone for a secondary pane", () => {
    const store = getOrCreatePaneStore(PANE);
    store.getState().setChapter("b1", "ch-2", 2);
    renderHook(() =>
      usePaneDocumentId({ documentId: "doc-2", paneStore: store, isPrimary: false })
    );
    expect(store.getState().documentId).toBe("doc-2");
    expect(useActiveEditorStore.getState().documentId).toBeNull();
  });
});
