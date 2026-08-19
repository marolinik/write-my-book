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
 *  4. Last-chance mirror (D-24): a SYNCHRONOUS localStorage write on every
 *     editor update. The 2s IDB tick plus an async unload flush lost 100% of
 *     a short typing burst on a hard crash (first tick not yet fired, no
 *     unload event, or the IDB put torn down mid-commit). The mirror makes
 *     the newest keystrokes durable in the same task that produced them;
 *     recovery takes the newer of {IDB draft, mirror}.
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
import {
  clearLastChanceDraft,
  readLastChanceDraft,
  writeLastChanceDraft,
} from "@/lib/offline/last-chance-mirror";

// ── Constants ─────────────────────────────────────────────────

/**
 * Fixed buffer cadence. Matches the autosave debounce so the durability
 * window equals today's best case, and keeps capturing offline typing every
 * ~2s even while network saves back off toward 60s.
 */
export const DRAFT_BUFFER_INTERVAL_MS = 2000;

/**
 * Keystroke-path mirror throttle (D-24 review): the synchronous mirror costs
 * a full ProseMirror→markdown serialize + stringify + localStorage write, so
 * it runs at most once per window — leading edge (first keystroke of a burst
 * is durable instantly) plus trailing edge (the last keystroke lands within
 * one window). The unload flush bypasses this entirely and mirrors
 * unconditionally. Residual worst case on a zero-settle hard kill with no
 * unload event: the final <=150ms of typing.
 */
export const MIRROR_KEYSTROKE_THROTTLE_MS = 150;

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
  /**
   * The live tiptap instance — the hook subscribes to its "update" event to
   * drive the synchronous last-chance mirror per keystroke (D-24). Passed
   * separately from editorRef because the ref mutation never re-runs effects.
   */
  editor: Editor | null;
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
  editor,
  paneChapterId,
  bookId,
  onBufferWrite,
}: UseDraftBufferOptions): DraftBufferApi {
  const isDirty = useStore(paneStore, (s) => s.isDirty);

  // Hash of the last successfully buffered markdown — skip redundant writes.
  const lastBufferedHashRef = useRef<string | null>(null);
  // Separate hash for the synchronous localStorage mirror (D-24) — the two
  // stores update on different cadences and must skip-check independently.
  const lastMirroredHashRef = useRef<string | null>(null);

  // Keep the callback out of bufferNow's identity so connectivity/render
  // churn never resets the buffer interval.
  const onBufferWriteRef = useRef(onBufferWrite);
  useEffect(() => {
    onBufferWriteRef.current = onBufferWrite;
  }, [onBufferWrite]);

  // New chapter — the hashes belong to the previous chapter's content.
  useEffect(() => {
    lastBufferedHashRef.current = null;
    lastMirroredHashRef.current = null;
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

  // (D-24) Synchronous last-chance mirror: same guards and serializer as
  // bufferNow, but localStorage's synchronous setItem — the write is durable
  // before this function returns, so a hard kill immediately after the last
  // keystroke cannot lose it. Per-keystroke cost is bounded: the editor
  // already serializes markdown every keystroke for the live word count, and
  // the hash check skips redundant writes.
  const mirrorNow = useCallback((): void => {
    const editorInstance = editorRef.current;
    if (!editorInstance || editorInstance.isDestroyed) return;

    const state = paneStore.getState();
    const chapterId = state.chapterId;
    if (!chapterId || !state.isDirty) return;

    const markdown = getMarkdownFromEditor(editorInstance);
    const hash = hashMarkdown(markdown);
    if (hash === lastMirroredHashRef.current) return;

    const ok = writeLastChanceDraft({
      chapterId,
      bookId,
      markdown,
      baseVersion: state.documentVersion,
    });
    if (ok) {
      lastMirroredHashRef.current = hash;
    }
  }, [bookId, editorRef, paneStore]);

  // (D-24) Keystroke-driven persistence, throttled leading+trailing:
  // the first keystroke of a burst mirrors synchronously; keystrokes inside
  // the window coalesce into one trailing write, so the last keystroke is
  // durable within MIRROR_KEYSTROKE_THROTTLE_MS. Registered after the
  // editor's own onUpdate (which marks the pane dirty), so the dirty guard
  // sees the current keystroke. Throttle state is effect-local: an editor
  // swap tears it down with the subscription.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let lastWriteAt = 0;
    let trailingHandle: ReturnType<typeof setTimeout> | null = null;

    const onUpdate = (): void => {
      const now = Date.now();
      const elapsed = now - lastWriteAt;
      if (elapsed >= MIRROR_KEYSTROKE_THROTTLE_MS) {
        lastWriteAt = now;
        mirrorNow();
        return;
      }
      if (trailingHandle !== null) return; // trailing already armed
      trailingHandle = setTimeout(() => {
        trailingHandle = null;
        lastWriteAt = Date.now();
        mirrorNow();
      }, MIRROR_KEYSTROKE_THROTTLE_MS - elapsed);
    };

    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
      if (trailingHandle !== null) {
        clearTimeout(trailingHandle);
        // The write this trailing timer owed is covered by the unload-flush
        // effect's unmount flush (mirrorNow unconditional, runs after this
        // cleanup in declaration order).
      }
    };
  }, [editor, mirrorNow]);

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
      // Mirror FIRST (synchronous — completes even mid-teardown), then the
      // best-effort async IDB write.
      mirrorNow();
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
  }, [bufferNow, mirrorNow]);

  const clearDraft = useCallback((chapterId: string): void => {
    // Reset the hashes so the next dirty tick rewrites even if content
    // returns to the exact last-buffered text (the draft rows are gone — a
    // skipped write would leave dirty words unprotected). Extra write is the
    // safe direction.
    lastBufferedHashRef.current = null;
    lastMirroredHashRef.current = null;
    // onlyIfMine: another tab's offline draft must survive this tab's save
    // success (spec §4.2). Both deletes are no-throw; failure means the
    // draft lingers until recovery/prune hygiene — harmless.
    void deleteDraft(chapterId, { onlyIfMine: true });
    clearLastChanceDraft(chapterId, { onlyIfMine: true });
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
      // (D-24) The synchronous mirror may hold keystrokes newer than the
      // last IDB tick (a crash inside the 2s window). Take the newer row —
      // both stamp the same shape. Read regardless of clientId: a crashed
      // tab's clientId died with the page, so a recoverable mirror is
      // always "foreign" — refusing foreign rows would disable mirror
      // crash-recovery outright (same reasoning as getDraft above).
      const mirror = readLastChanceDraft(chapterId);
      const newest =
        mirror && (!draft || mirror.updatedAt > draft.updatedAt)
          ? mirror
          : draft;
      const decision = decideRecovery(newest, serverMarkdown, serverVersion);
      if (mirror) {
        // Consume only THIS tab's row. A foreign row can also belong to a
        // LIVE tab still typing this chapter in parallel — deleting it
        // would reopen the exact D-24 loss window for that tab (its next
        // hard crash loses everything since its last 2s IDB tick). A
        // surviving foreign row is reaped by: the decision-"none" hygiene
        // below once the server holds its words, restore's immediate
        // re-buffer making the IDB row the newer source on later loads,
        // explicit discard's unconditional clear, or the 14-day prune.
        clearLastChanceDraft(chapterId, { onlyIfMine: true });
        if (decision.kind === "none") {
          // Words already match the server — garbage for every tab.
          // CAS-guarded to the exact revision read, so a live tab's
          // concurrent rewrite survives.
          clearLastChanceDraft(chapterId, {
            ifUpdatedAtEquals: mirror.updatedAt,
          });
        }
      }
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
