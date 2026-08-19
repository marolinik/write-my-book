"use client";

/**
 * D-133 — accept-then-close server-flush.
 *
 * The autosave debounce (manuscript-editor.tsx) schedules the version-stamped
 * CAS PUT ~2s out. A phone that backgrounds within that window — normal phone
 * behaviour; one judge rated the resulting loss S1 — never fired the PUT, so an
 * accepted ghost sentence reached the LOCAL draft buffer (use-draft-buffer.ts:
 * IDB + synchronous localStorage mirror) but never the SERVER. The local mirror
 * only recovers on the SAME browser profile; the server copy is exactly what
 * the judges evidenced losing.
 *
 * This module flushes the SAME stamped save immediately on
 * `visibilitychange:hidden` and `pagehide`, so a real close still lands the
 * words server-side. Three concerns, each independently unit-testable, so
 * manuscript-editor.tsx (already over the line cap) only gains thin wiring:
 *
 *  1. shouldFlushServerSave — the pure flush-decision table.
 *  2. bodyFitsKeepalive     — the keepalive 64KB body-cap guard.
 *  3. registerServerFlushGuards / useServerSaveFlush — the unload wiring.
 *
 * The flush reuses the existing saveContent path, so the version stamp, 409
 * no-op/conflict handling, dirtiness settlement, and draft-clear all keep
 * working when the page SURVIVES — the common case, since phone backgrounding
 * usually keeps the page alive and the PUT response IS processed. It must never
 * corrupt CAS state.
 */

import { useEffect, useRef } from "react";
import type { StoreApi } from "zustand";
import type { EditorPaneState } from "@/stores/editor-store";

// ── (1) flush decision (pure) ─────────────────────────────────

export interface ServerFlushInput {
  isDirty: boolean;
  isSaving: boolean;
  saveConflict: boolean;
  isOnline: boolean;
}

/**
 * Decide whether an unload handler should dispatch an immediate server save.
 *
 *  - not dirty         → nothing to persist.
 *  - already saving    → the in-flight PUT's dispatched words are already
 *                        durable and the remainder is covered by the draft
 *                        mirror; a second dispatch would carry the same
 *                        expectedVersion and 409 against itself.
 *  - conflict pending  → autosave is deliberately suspended and the
 *                        localStorage conflict-draft already snapshotted the
 *                        words; a stamped PUT here would just re-409.
 *  - offline           → the PUT would only fail into the backoff machinery at
 *                        a moment the page is dying; the draft mirror plus the
 *                        reconnect short-circuit cover it.
 *
 * Because the decision is gated on `isDirty && !isSaving`, a rapid visibility
 * flip-flap cannot storm the server: the first flush sets isSaving true (and,
 * on success, clears isDirty), so every subsequent hidden event is a no-op
 * until real new typing re-dirties the pane.
 */
export function shouldFlushServerSave(input: ServerFlushInput): boolean {
  const { isDirty, isSaving, saveConflict, isOnline } = input;
  if (!isDirty) return false;
  if (isSaving) return false;
  if (saveConflict) return false;
  if (!isOnline) return false;
  return true;
}

// ── (2) keepalive body cap ────────────────────────────────────

/**
 * fetch `keepalive` request bodies are capped at 64KB by the browser (whatwg
 * fetch — the sum of all inflight keepalive request bodies must stay under
 * 64KB or the fetch throws). We stay under 60KB to leave headroom for the JSON
 * envelope and headers around the markdown. Over the cap the flush falls back
 * to a normal (non-keepalive) fetch — best effort; the local draft buffer
 * still covers recovery.
 */
export const KEEPALIVE_MAX_BODY_BYTES = 60_000;

/**
 * Exact UTF-8 byte length the browser will send for `body`. Char count would
 * undercount multibyte prose (accents, em-dashes, CJK), so both the single-body
 * cap and the shared budget reservation must measure bytes.
 */
export function keepaliveBodyBytes(body: string): number {
  return new TextEncoder().encode(body).length;
}

/** True when the serialized PUT body fits inside the keepalive byte cap. */
export function bodyFitsKeepalive(body: string): boolean {
  return keepaliveBodyBytes(body) <= KEEPALIVE_MAX_BODY_BYTES;
}

/**
 * F2 — the whatwg keepalive limit caps the SUM of ALL inflight keepalive
 * request bodies (the comment above), not each body in isolation.
 * split-editor.tsx mounts TWO ManuscriptEditor panes; on a real close both
 * flush at once, each dispatching a keepalive PUT. Two ~35-60KB bodies each
 * pass bodyFitsKeepalive individually yet jointly breach the browser cap — the
 * second fetch then throws a TypeError and that pane's accepted words never
 * reach the server. This module-level budget tracks outstanding keepalive bytes
 * so the decision point can demote the overflowing pane to a plain fetch
 * instead of throwing. The reservation total is kept at KEEPALIVE_MAX_BODY_BYTES
 * (the same 60KB cap, leaving headroom under the browser's hard 64KB limit).
 */
let outstandingKeepaliveBytes = 0;

/**
 * Reserve `bytes` against the shared in-flight keepalive budget. Returns false
 * (reserving nothing) when the reservation would push the outstanding sum past
 * KEEPALIVE_MAX_BODY_BYTES — the caller must then send a plain, non-keepalive
 * fetch (never a throw). A successful reservation MUST be paired with
 * releaseKeepaliveBudget(bytes) when the fetch settles on a surviving page; on
 * the page-death path the process is gone, so a missed release is harmless.
 */
export function reserveKeepaliveBudget(bytes: number): boolean {
  if (outstandingKeepaliveBytes + bytes > KEEPALIVE_MAX_BODY_BYTES) {
    return false;
  }
  outstandingKeepaliveBytes += bytes;
  return true;
}

/**
 * Release a prior successful reservation once its fetch settles (the common
 * phone-backgrounding survival path — visibilitychange without close), so later
 * flushes regain budget. Clamped at zero to tolerate any stray double-release.
 */
export function releaseKeepaliveBudget(bytes: number): void {
  outstandingKeepaliveBytes -= bytes;
  if (outstandingKeepaliveBytes < 0) outstandingKeepaliveBytes = 0;
}

/** Test-only: reset the shared budget between cases. */
export function __resetKeepaliveBudget(): void {
  outstandingKeepaliveBytes = 0;
}

// ── (3) unload wiring ─────────────────────────────────────────

interface FlushEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface FlushGuardTargets {
  win: FlushEventTarget;
  doc: FlushEventTarget & { readonly visibilityState: DocumentVisibilityState };
}

/**
 * Wire best-effort unload guards that call `flush` on `pagehide` and on
 * `visibilitychange` when the document becomes hidden — the two events phone
 * browsers actually deliver on backgrounding (beforeunload/unload are
 * unreliable on mobile). Returns a cleanup that removes both listeners.
 * Targets are injectable for testing; they default to the DOM globals.
 */
export function registerServerFlushGuards(
  flush: () => void,
  targets?: FlushGuardTargets
): () => void {
  const win = targets?.win ?? window;
  const doc = targets?.doc ?? document;

  const onPageHide = () => flush();
  const onVisibilityChange = () => {
    if (doc.visibilityState === "hidden") flush();
  };

  win.addEventListener("pagehide", onPageHide);
  doc.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    win.removeEventListener("pagehide", onPageHide);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

export interface UseServerSaveFlushOptions {
  paneStore: StoreApi<EditorPaneState>;
  /** Connectivity in a ref so the guard reads the value at flush time. */
  isOnlineRef: { readonly current: boolean };
  /** Cancel the pending autosave debounce so the flush isn't double-dispatched. */
  cancelPendingSave: () => void;
  /**
   * Reconcile the immersive buffer INTO tiptap before we serialize (ordering
   * hazard: our read of the editor must happen AFTER immersive reconciliation,
   * else the newest immersive keystrokes are absent from the PUT). Idempotent /
   * change-guarded, so it is a no-op when immersive mode is closed.
   */
  reconcileBeforeFlush?: () => void;
  /** The SAME stamped save path; keepalive lets the PUT finish after teardown. */
  flushSave: (options: { keepalive: boolean }) => void;
}

/**
 * D-133 wiring hook. Registers the unload guards once and reads live inputs
 * through a ref, so connectivity/render churn never re-registers the listeners
 * (and never resets a mid-close flush). Follows the use-draft-buffer.ts
 * composition pattern: all the logic lives here; the editor keeps only a thin
 * call.
 */
export function useServerSaveFlush(options: UseServerSaveFlushOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const flush = (): void => {
      const o = optionsRef.current;
      // Reconcile immersive edits FIRST so the serialized markdown is current
      // (ordering hazard — see reconcileBeforeFlush).
      o.reconcileBeforeFlush?.();
      const s = o.paneStore.getState();
      if (
        !shouldFlushServerSave({
          isDirty: s.isDirty,
          isSaving: s.isSaving,
          saveConflict: !!s.saveConflict,
          isOnline: o.isOnlineRef.current,
        })
      ) {
        return;
      }
      // Cancel the queued debounce: the flush carries the same version stamp,
      // and a stray debounce firing afterwards would 409 against it.
      o.cancelPendingSave();
      o.flushSave({ keepalive: true });
    };
    return registerServerFlushGuards(flush);
    // Registered once; live inputs are read through optionsRef at flush time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
