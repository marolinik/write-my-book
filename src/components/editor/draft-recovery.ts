"use client";

/**
 * Applies a RecoveryDecision from the offline draft buffer to a live editor
 * pane (Tier 2.2). Extracted from manuscript-editor.tsx — the application
 * logic is pure plumbing around guards and store transitions, and the editor
 * file is already over the size cap.
 *
 * Invariants owned here:
 *  - Stale recoveries are dropped (editor torn down, chapter switched, the
 *    writer started typing during the async IDB read, or a clean-resync
 *    adopted a newer server version) — live words always win over a draft.
 *  - markDirty lands synchronously after setContent so the clean-resync
 *    branch of the content-load effect can never clobber the restored words
 *    on the next refetch.
 *  - A "conflict" decision re-enters the existing CAS machinery (stale
 *    documentVersion + setSaveConflict + toast) — never an unstamped PUT.
 */

import type { Editor } from "@tiptap/react";
import type { StoreApi } from "zustand";
import { toast } from "sonner";
import type { EditorPaneState } from "@/stores/editor-store";
import type { RecoveryDecision } from "@/hooks/use-draft-buffer";
import { deleteDraft } from "@/lib/offline/draft-store";
import { clearLastChanceDraft } from "@/lib/offline/last-chance-mirror";

export interface ApplyRecoveryOptions {
  decision: RecoveryDecision;
  editorRef: { current: Editor | null };
  paneStore: StoreApi<EditorPaneState>;
  /** The chapter the recovery decision was computed for. */
  chapterId: string;
  serverMarkdown: string;
  serverVersion: number | null;
  /** Surfaces the existing non-blocking conflict toast. */
  onConflictToast: () => void;
  /** Re-buffers immediately so the row is re-stamped under this tab's clientId. */
  bufferNow: () => Promise<void>;
  /** The draft-buffer hook's clearDraft (resets the write-skip hash). */
  clearDraft: (chapterId: string) => void;
}

export function applyRecoveryDecision({
  decision,
  editorRef,
  paneStore,
  chapterId,
  serverMarkdown,
  serverVersion,
  onConflictToast,
  bufferNow,
  clearDraft,
}: ApplyRecoveryOptions): void {
  if (decision.kind === "none") return;

  const editor = editorRef.current;
  if (!editor || editor.isDestroyed) return;
  const state = paneStore.getState();
  if (state.chapterId !== chapterId) return;
  if (state.isDirty) return;
  // A clean-resync may have adopted a newer server version during the async
  // IDB read — the decision was computed against stale state; drop it (the
  // draft stays for the next load to re-decide).
  if (state.documentVersion !== serverVersion) return;

  editor.commands.setContent(decision.markdown, { emitUpdate: false });
  // Synchronous markDirty — blocks clean-resync from clobbering the restored
  // words on the next refetch.
  paneStore.getState().markDirty();

  if (decision.kind === "conflict") {
    // Mirror the live-tab 409 state: documentVersion = the draft's stale
    // base so buffer re-writes keep the conflict signal across another
    // crash. Resolution goes through the existing dialog.
    paneStore.getState().setDocumentVersion(decision.baseVersion);
    paneStore.getState().setSaveConflict({
      serverContent: decision.serverContent,
      serverVersion: decision.serverVersion,
    });
    onConflictToast();
  } else {
    toast.info("Recovered unsaved changes from your last session", {
      action: {
        label: "Discard",
        onClick: () => discardRecovery(),
      },
    });
  }

  // Re-buffer immediately: adopts the (possibly pre-crash) draft row under
  // this tab's clientId so the save-success clearDraft ({onlyIfMine}) can
  // purge it, and stamps the corrected base version.
  void bufferNow();

  function discardRecovery(): void {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const st = paneStore.getState();
    if (st.chapterId !== chapterId) return;

    ed.commands.setContent(serverMarkdown, { emitUpdate: false });
    // If anything already left for the server — a post-recovery autosave in
    // flight or one that landed with a newer version — stay dirty so the
    // discard is pushed back to the server too; otherwise nothing escaped
    // the editor and clean is truthful. (A save landing AFTER this click is
    // also healed: the success path re-marks dirty on content divergence.)
    if (st.isSaving || st.documentVersion !== serverVersion) {
      st.markDirty();
    } else {
      st.markClean();
    }
    st.setDraftSavedAt(null);
    // clearDraft resets the buffer's write-skip hashes and deletes this tab's
    // rows; the unconditional deletes backstop rows still stamped with a
    // pre-crash clientId (the user explicitly discarded THIS draft) — the
    // last-chance mirror included, or the next load would resurrect it.
    clearDraft(chapterId);
    void deleteDraft(chapterId);
    clearLastChanceDraft(chapterId);
  }
}
