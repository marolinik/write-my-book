"use client";

/**
 * Tier 2.2 offline resilience — IndexedDB draft buffer for the chapter
 * editor. Composes three concerns so `manuscript-editor.tsx` (already over
 * the line cap) only gains thin wiring:
 *
 *  1. Write-behind buffer: while the pane is dirty, serialize the editor
 *     every 2s (fixed — deliberately NOT subject to the autosave failure
 *     backoff) and mirror it to IndexedDB. Skips the write when the
 *     serialized markdown hash matches the last buffered value.
 *  2. Unload flush: best-effort `bufferNow()` on `visibilitychange:hidden`
 *     and `pagehide`.
 *  3. Recovery decision: `checkRecovery()` returns a pure `RecoveryDecision`
 *     — this hook NEVER calls `markDirty`/`setSaveConflict`/editor commands
 *     itself; the editor applies side effects (keeps the decision testable
 *     and the stale-chapter guard in one place).
 *
 * The buffer is a crash-safety mirror, not a save path: all server writes
 * stay on the existing stamped PUT.
 */

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";
import type { Editor } from "@tiptap/react";
import type { EditorPaneState } from "@/stores/editor-store";
import {
  getMarkdownFromEditor,
  sanitizeUnicode,
} from "@/components/editor/editor-utils";
import {
  deleteDraft,
  getDraft,
  putDraft,
  type ChapterDraft,
} from "@/lib/offline/draft-store";

// ── Constants ─────────────────────────────────────────────────

/**
 * Fixed buffer cadence. Matches the autosave debounce so the durability
 * window equals today's best case, and keeps capturing offline typing every
 * ~2s even while network saves back off toward 60s.
 */
export const DRAFT_BUFFER_INTERVAL_MS = 2000;

// ── Recovery decision (pure) ──────────────────────────────────

export type RecoveryDecision =
  | { kind: "none" }
  | { kind: "restore"; markdown: string }
  | {
      kind: "conflict";
      markdown: string;
      serverContent: string;
      serverVersion: number;
      /**
       * The draft's original CAS base. The editor must adopt this as the
       * pane's documentVersion so buffer re-writes during conflict suspension
       * keep the stale stamp — otherwise a second crash would re-decide
       * "restore" against the moved server version and bypass the dialog.
       */
      baseVersion: number | null;
    };

/**
 * Pure decision table for recovery-on-load (spec §1.5). Exported for direct
 * unit testing (no test framework in repo yet — kept pure for future vitest).
 *
 *  - no draft, or draft content == server content → none (caller prunes)
 *  - server has no document (version null) → restore; the normal unstamped
 *    save creates v1 via the route's new-document path
 *  - draft.baseVersion === serverVersion → restore (strictly newer typing on
 *    the same base; autosave then PUTs with the loaded expectedVersion)
 *  - otherwise (server moved, or baseVersion null/unprovable) → conflict;
 *    the editor drops into the existing setSaveConflict machinery — never an
 *    unstamped overwrite
 */
export function decideRecovery(
  draft: ChapterDraft | null,
  serverMarkdown: string,
  serverVersion: number | null
): RecoveryDecision {
  if (!draft) return { kind: "none" };
  if (sanitizeUnicode(draft.markdown) === sanitizeUnicode(serverMarkdown)) {
    return { kind: "none" };
  }
  if (serverVersion === null) {
    return { kind: "restore", markdown: draft.markdown };
  }
  if (draft.baseVersion === serverVersion) {
    return { kind: "restore", markdown: draft.markdown };
  }
  return {
    kind: "conflict",
    markdown: draft.markdown,
    serverContent: serverMarkdown,
    serverVersion,
    baseVersion: draft.baseVersion,
  };
}

// ── Cheap content hash (skip redundant IDB writes) ────────────

/** Length + djb2 — collision-safe enough for "did the text change" checks. */
function hashMarkdown(markdown: string): string {
  let hash = 5381;
  for (let i = 0; i < markdown.length; i += 1) {
    hash = ((hash << 5) + hash + markdown.charCodeAt(i)) | 0;
  }
  return `${markdown.length}:${hash}`;
}

// ── Hook ──────────────────────────────────────────────────────

export interface BufferWriteResult {
  ok: boolean;
  at: number; // epoch ms of the write attempt
}

export interface UseDraftBufferOptions {
  paneStore: StoreApi<EditorPaneState>;
  editorRef: { current: Editor | null };
  paneChapterId: string | null;
  bookId: string;
  /**
   * Fired after each actual buffer write attempt (skipped-unchanged ticks do
   * not fire). Integration uses this to drive the pane's `draftSavedAt`
   * indicator state without this hook touching store fields it doesn't own.
   */
  onBufferWrite?: (result: BufferWriteResult) => void;
}

export interface DraftBufferApi {
  /** Serialize + mirror to IDB now (no-op when clean/unchanged). Never rejects. */
  bufferNow: () => Promise<void>;
  /** Fire-and-forget delete of this tab's draft (multi-tab safe via clientId). */
  clearDraft: (chapterId: string) => void;
  /** Read draft + return the pure recovery decision; prunes equal/stale-equal drafts. */
  checkRecovery: (
    chapterId: string,
    serverMarkdown: string,
    serverVersion: number | null
  ) => Promise<RecoveryDecision>;
}

export function useDraftBuffer({
  paneStore,
  editorRef,
  paneChapterId,
  bookId,
  onBufferWrite,
}: UseDraftBufferOptions): DraftBufferApi {
  const isDirty = useStore(paneStore, (s) => s.isDirty);

  // Hash of the last successfully buffered markdown — skip redundant writes.
  const lastBufferedHashRef = useRef<string | null>(null);

  // Keep the callback out of bufferNow's identity so connectivity/render
  // churn never resets the buffer interval.
  const onBufferWriteRef = useRef(onBufferWrite);
  useEffect(() => {
    onBufferWriteRef.current = onBufferWrite;
  }, [onBufferWrite]);

  // New chapter — the hash belongs to the previous chapter's content.
  useEffect(() => {
    lastBufferedHashRef.current = null;
  }, [paneChapterId]);

  const bufferNow = useCallback(async (): Promise<void> => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;

    // Read chapter/dirty/version from the STORE at call time (not props) so
    // an interval tick or unload flush after a chapter switch can't write the
    // new chapter's id with stale closure data.
    const state = paneStore.getState();
    const chapterId = state.chapterId;
    if (!chapterId || !state.isDirty) return;

    // Same serializer as saveContent — buffered markdown is byte-identical
    // to what the PUT would send.
    const markdown = getMarkdownFromEditor(editor);
    const hash = hashMarkdown(markdown);
    if (hash === lastBufferedHashRef.current) return;

    // In-flight window: a draft holding keystrokes newer than a concurrent
    // PUT is deleted by the save-success clearDraft. The editor's success
    // path re-marks dirty when its content moved past the dispatched payload,
    // keeping this interval alive so the next tick re-persists — and the
    // hash reset in clearDraft guarantees that rewrite isn't skipped.
    const ok = await putDraft({
      chapterId,
      bookId,
      markdown,
      baseVersion: state.documentVersion,
    });
    if (ok) {
      lastBufferedHashRef.current = hash;
    }
    onBufferWriteRef.current?.({ ok, at: Date.now() });
  }, [bookId, editorRef, paneStore]);

  // (1) Write-behind buffer: fixed 2s cadence while dirty. Runs through
  // conflict suspension and network backoff unchanged — only dirtiness gates.
  useEffect(() => {
    if (!isDirty || !paneChapterId) return;
    const intervalId = setInterval(() => {
      void bufferNow();
    }, DRAFT_BUFFER_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isDirty, paneChapterId, bufferNow]);

  // (2) Unload flush: IDB writes initiated before unload usually complete —
  // best-effort by design; recovery-on-load covers the crash path. The
  // cleanup also flushes on unmount so SPA navigation / chapter switch
  // doesn't drop the last ≤2s of offline typing (bufferNow's store-read +
  // isDirty/editor guards make a stale unmount flush a safe no-op).
  useEffect(() => {
    const flush = () => {
      void bufferNow();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, [bufferNow]);

  const clearDraft = useCallback((chapterId: string): void => {
    // Reset the hash so the next dirty tick rewrites even if content returns
    // to the exact last-buffered text (the draft row is gone — a skipped
    // write would leave dirty words unprotected). Extra write is the safe
    // direction.
    lastBufferedHashRef.current = null;
    // onlyIfMine: another tab's offline draft must survive this tab's save
    // success (spec §4.2). deleteDraft is no-throw; failure means the draft
    // lingers until recovery/prune hygiene — harmless.
    void deleteDraft(chapterId, { onlyIfMine: true });
  }, []);

  const checkRecovery = useCallback(
    async (
      chapterId: string,
      serverMarkdown: string,
      serverVersion: number | null
    ): Promise<RecoveryDecision> => {
      if (!chapterId) return { kind: "none" };
      // Reads regardless of clientId — a crashed tab's clientId is gone.
      const draft = await getDraft(chapterId);
      const decision = decideRecovery(draft, serverMarkdown, serverVersion);
      if (draft && decision.kind === "none") {
        // Draft content already matches the server — hygiene delete of the
        // exact row revision we read (an equal draft is garbage for every
        // tab, but a concurrent tab may have rewritten the row since the
        // read above — that newer draft must survive).
        void deleteDraft(chapterId, { ifUpdatedAtEquals: draft.updatedAt });
      }
      return decision;
    },
    []
  );

  return { bufferNow, clearDraft, checkRecovery };
}
