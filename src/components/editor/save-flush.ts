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

// ── Outgoing-chapter and pre-rewrite flush (P1-5, P2-48) ──────────────

/** What a pane had not saved yet, captured before the pane moves on. */
export interface PendingSaveSnapshot {
  chapterId: string;
  markdown: string;
  documentVersion: number | undefined;
}

interface PaneSaveState {
  isDirty: boolean;
  saveConflict: unknown;
  chapterId: string | null;
  documentVersion: number | null | undefined;
}

/**
 * Snapshot the outgoing chapter's unsaved text, synchronously, before the
 * store resets for the next chapter. Nothing for a clean pane, and nothing
 * while a save conflict is open: the conflict dialog owns those words.
 */
export function capturePendingSave(state: PaneSaveState, markdown: string): PendingSaveSnapshot | null {
  if (!state.isDirty || state.saveConflict || !state.chapterId) return null;
  return {
    chapterId: state.chapterId,
    markdown,
    documentVersion: state.documentVersion ?? undefined,
  };
}

export type SaveSnapshot = (snapshot: PendingSaveSnapshot) => Promise<unknown>;

/**
 * Save a captured snapshot to ITS chapter (never to whatever chapter the pane
 * shows by the time the request runs). Never throws: it runs from React
 * cleanups. A failure is reported; the local draft buffer still holds the text.
 */
export async function flushPendingSave(
  snapshot: PendingSaveSnapshot | null,
  save: SaveSnapshot,
  inFlight: InFlightSave | null = null
): Promise<"saved" | "clean" | "failed"> {
  if (!snapshot) return "clean";
  try {
    // Wave 7: a PUT still in flight carries the same expectedVersion the
    // snapshot captured; sent alongside, the snapshot would 409 against it.
    // Wait for it and send against the version it produced. The store cannot
    // tell us: by now it belongs to the next chapter and drops that result.
    // Only a PUT of THIS chapter moves this snapshot's version (Wave 7
    // review): another chapter's PUT is neither awaited nor stamped.
    const versionAfter = inFlight && inFlight.chapterId === snapshot.chapterId ? await inFlight.settled : undefined;
    await save(versionAfter === undefined ? snapshot : { ...snapshot, documentVersion: versionAfter });
    return "saved";
  } catch (error) {
    console.error(`[editor] saving chapter ${snapshot.chapterId} on the way out failed:`, error);
    return "failed";
  }
}

/** A pane's PUT in flight: its chapter, and the version it produced (undefined if it failed). */
export interface InFlightSave {
  chapterId: string | null;
  settled: Promise<number | undefined>;
}

export interface InFlightSaveRef {
  current: InFlightSave | null;
}

/**
 * Wave 7: remember a PUT while it is in flight so a flush can wait for it
 * instead of racing it with the same version stamp. Never rejects; clears
 * itself when it settles (unless a newer PUT has replaced it).
 */
export function trackInFlightSave(
  ref: InFlightSaveRef,
  request: Promise<{ version?: number | null }>,
  chapterId: string | null
): void {
  const entry: InFlightSave = {
    chapterId,
    settled: request.then(
      (res) => res.version ?? undefined,
      () => undefined
    ),
  };
  ref.current = entry;
  void entry.settled.then(() => {
    if (ref.current === entry) ref.current = null;
  });
}

const pendingFlushers = new Set<() => Promise<void>>();

/** A pane registers how to save its pending text now; returns the unregister. */
export function registerPendingFlush(flush: () => Promise<void>): () => void {
  pendingFlushers.add(flush);
  return () => {
    pendingFlushers.delete(flush);
  };
}

/**
 * Save every pane's pending text before a first-party rewrite (Replace all,
 * version Restore, accepting a finding) changes the chapter on the server, so
 * the rewrite starts from what the writer typed and the next autosave does not
 * 409 against it (P2-48).
 */
export async function flushAllPendingSaves(): Promise<void> {
  await Promise.allSettled([...pendingFlushers].map((flush) => flush()));
}
