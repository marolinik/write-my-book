"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import { joinGhostSuggestion } from "./ghost-text-join";
import {
  ghostOverlayPlacement,
  type OverlayPlacement,
} from "./ghost-overlay-placement";
import { useCoarsePointer } from "./use-coarse-pointer";
import {
  quickAssistErrorNotice,
  shouldSurfaceGhostError,
  isWallSuppressionActive,
  QUICK_ASSIST_FALLBACK_MESSAGE,
  type QuickAssistErrorNotice,
} from "./quick-assist-client-errors";
import { readQuickAssistFrames } from "./quick-assist-stream-client";

/**
 * Gap 4: Inline AI Ghost-Text Completions (Copilot-style)
 * 
 * Shows faded AI-generated continuation text after the cursor position.
 * Triggered by a 1.5-second typing pause.
 * Accept with Tab, dismiss with Escape or by typing.
 * 
 * Architecture:
 * - Monitors the editor for typing pauses
 * - Sends the surrounding context (last ~500 chars) to the ghost-text API
 * - Renders the suggestion as a faded span after cursor
 * - Tab accepts, Escape dismisses
 */

interface AIGhostTextProps {
  editor: Editor | null;
  bookId: string;
  chapterNumber: number;
  /** Whether ghost text is enabled */
  enabled: boolean;
  /**
   * D-137: true while the writer is in immersive focus mode. The ghost overlay
   * (z-50), pending dots (z-50) and cap-wall banner (z-40) all render BENEATH
   * the opaque z-[100] immersive surface, so a suggestion produced during
   * immersive writing is invisible AND has no accept affordance — yet the
   * debounced immersive→tiptap sync (manuscript-editor.tsx setContent) fires the
   * editor "update" this component listens for, arming billable fetches whose
   * result the writer can never see (a success bills; a 429 wall is silent).
   * When immersive, ghost fetching + rendering is fully suppressed (folded into
   * the effective-enabled gate below), killing the billable-invisible pairing at
   * its root instead of surfacing one half of it into the distraction-free view.
   */
  immersive?: boolean;
}

const PAUSE_MS = 1500; // 1.5 seconds of inactivity triggers a suggestion
const MIN_CONTEXT_LENGTH = 50; // Need at least 50 chars of context
const MAX_SUGGESTION_LENGTH = 150; // Cap ghost text at ~1 sentence
// D-132 (F3+F6): coarse-pointer accept is tap-vs-drag discriminated — a pointer
// that travels past this slop (px) between down and up is a scroll/drag, not a
// tap, and must NOT insert the suggestion.
const TAP_SLOP_PX = 10;
// D5 (§7): the >8s "still writing…" affordance. Rendered top-anchored IN the
// cursor overlay (not a bottom sonner toast — stays D-139-clean) so a slow
// stream is never a silent hang.
const STILL_WRITING_MS = 8000;
// D5 (§7): the measured-latency chip is shown only on a slow (cold-start) hit,
// so warm suggestions stay visually clean.
const TIMING_CHIP_MIN_MS = 2500;

/**
 * D-144: the last two document characters before the cursor — the input the
 * D-130 join rule needs to decide a leading space. Shared by the accept path
 * (what gets INSERTED) AND the overlay preview (what the writer READS) so the
 * two can never disagree — the whole point of D-144. ("" at doc/paragraph start,
 * where ProseMirror's textBetween across the node boundary yields nothing.)
 */
function ghostCharsBefore(editor: Editor): string {
  const { from } = editor.state.selection;
  return from > 0
    ? editor.state.doc.textBetween(Math.max(0, from - 2), from)
    : "";
}

export function AIGhostText({
  editor,
  bookId,
  chapterNumber,
  enabled,
  immersive = false,
}: AIGhostTextProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  // D-138: the overlay carries a clamped/flipped maxWidth, not just a point —
  // at the right edge of a phone the raw caret position wraps the suggestion
  // one-word-per-line and buries the accept pill. Placement is a value object
  // (top/left/maxWidth) so the two anchor sites can never drift.
  const [position, setPosition] = useState<OverlayPlacement | null>(null);
  // D5: the fetch wait was blind — no affordance between pause and render.
  const [pending, setPending] = useState(false);
  // D5/D-140: accept (Tab/tap) is ARMED ONLY on the `done` frame. While tokens
  // are still flowing the ghost renders WITHOUT a pill and accept is inert, so
  // a partial fragment can never be inserted. The non-stream JSON fallback sets
  // this true immediately (nothing to wait on).
  const [streamDone, setStreamDone] = useState(false);
  // D5 (§7) / D-145: the timing chip shows CLIENT-FELT latency — measured from
  // the moment the pause-timer fired the fetch to the moment accept armed (the
  // `done` frame) — because the server's elapsedMs (~6.7s) under-reports the
  // ~9–11s the writer actually waited (stream tail + render fall outside any
  // server number). Drives the subtle timing chip when > 2.5s.
  const [timingMs, setTimingMs] = useState<number | null>(null);
  // D-145: the server's own elapsedMs, kept available (chip tooltip) but NOT the
  // displayed figure — the writer-felt one above is.
  const [serverTimingMs, setServerTimingMs] = useState<number | null>(null);
  // D5 (§7): true once a stream has run >8s with no `done` frame.
  const [stillWriting, setStillWriting] = useState(false);
  // D-134: the cap wall is a PERSISTENT banner, not a cooled-down toast. The
  // toast throttle re-silenced pauses 2–5 inside the 60s window (the old D-129
  // silent wall); the banner stays until dismissed or a success lifts it.
  const [wallNotice, setWallNotice] = useState<QuickAssistErrorNotice | null>(
    null
  );
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // D-145: wall-clock start of the in-flight fetch (set when the pause-timer
  // fires it). Felt latency = accept-armed time − this. A ref (not state) so it
  // never re-renders or destabilises fetchSuggestion.
  const fetchStartRef = useRef<number | null>(null);
  const lastTextRef = useRef<string>("");
  // D5 (§7): >8s "still writing…" watchdog timer for the active stream.
  const stillWritingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // D-134 (F4): timestamp of the most recent 429 cap-wall notice. Held in a ref
  // (not state) so fetchSuggestion stays referentially stable — the suppression
  // window is read imperatively at fetch time, not rendered. Dismiss clears the
  // banner state but leaves this set, so a dismiss can't re-arm the doomed loop.
  const wallSinceRef = useRef<number | null>(null);
  // D-132 (F3+F6): live tap gesture on the coarse-pointer overlay. Records the
  // pointer id + down coords so pointerup can tell a settled tap from a scroll.
  const pointerGestureRef = useRef<{
    id: number;
    x: number;
    y: number;
    cancelled: boolean;
  } | null>(null);
  // D-129: per-message cooldown — each distinct error copy keeps its own
  // last-shown time so alternating messages can't defeat the throttle.
  const lastErrorRef = useRef<Map<string, number>>(new Map());
  const router = useRouter();
  // D-132: phones have no Tab key — advertise a tap hint and make the overlay
  // itself the (generous) tap target on coarse-pointer devices.
  const coarsePointer = useCoarsePointer();

  // D-137: the single "ghost is live" gate. Immersive folds into it so that
  // entering immersive tears down the update listener, aborts any in-flight
  // fetch and clears pending state through the EXACT same machinery as a
  // ghost-text toggle-off — no new suppression path to keep in sync. While
  // immersive, no fetch is armed (nothing bills) and nothing renders (the
  // overlay/banner would be occluded by the z-[100] surface anyway).
  const active = enabled && !immersive;

  // D-129: the server answers the cap wall (429), the reasoning-model
  // backstop (422 MODEL_NO_QUICK_SUGGEST), and 5xx with honest copy — it must
  // reach the writer instead of dying in a silent early-return. Throttled so
  // the per-pause retrigger can't storm the same toast.
  const surfaceError = useCallback(
    (notice: QuickAssistErrorNotice) => {
      // D-134: the plan cap wall (429 + upgradeToTier) becomes a PERSISTENT
      // banner and bypasses the per-message toast cooldown entirely — the
      // cooldown re-silenced pauses 2–5 inside the 60s window. Non-wall toasts
      // stay governed by the cooldown map unchanged.
      if (notice.upgrade) {
        // F10: setWallNotice on every new 429 refreshes the copy; F4: stamp the
        // wall time so fetchSuggestion suppresses the doomed per-pause refetch
        // until the WALL_RETRY_MS window elapses.
        setWallNotice(notice);
        wallSinceRef.current = Date.now();
        return;
      }
      const now = Date.now();
      if (!shouldSurfaceGhostError(lastErrorRef.current, notice.message, now)) {
        return;
      }
      lastErrorRef.current = new Map(lastErrorRef.current).set(
        notice.message,
        now
      );
      if (notice.openSettings) {
        toast.error(notice.message, {
          action: {
            label: "Open Settings",
            onClick: () => router.push("/settings"),
          },
        });
      } else {
        toast.error(notice.message);
      }
    },
    [router]
  );

  // D5 (§7): the >8s "still writing…" watchdog. armed on the first SSE byte,
  // cleared on done/error/abort/dismiss. Stable (refs + stable setState) so it
  // never destabilises fetchSuggestion.
  const armStillWriting = useCallback(() => {
    if (stillWritingTimer.current) clearTimeout(stillWritingTimer.current);
    setStillWriting(false);
    stillWritingTimer.current = setTimeout(
      () => setStillWriting(true),
      STILL_WRITING_MS
    );
  }, []);
  const clearStillWriting = useCallback(() => {
    if (stillWritingTimer.current) {
      clearTimeout(stillWritingTimer.current);
      stillWritingTimer.current = null;
    }
    setStillWriting(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      if (stillWritingTimer.current) clearTimeout(stillWritingTimer.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // D5 (§7): warmup ping on editor mount — fire-and-forget so the ghost route
  // module is JIT-compiled before the first real typing pause. Returns before
  // checkQuota/key-load/LLM, so it never bills and never writes; the result is
  // deliberately ignored (a 429/500 here is harmless). Best-effort in multi-
  // instance prod — the honest cold-start story is the measured Server-Timing,
  // not a claim that warmup eliminates cold start.
  useEffect(() => {
    if (!active) return;
    void fetch(`/api/books/${bookId}/ghost-text?warmup=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      keepalive: true,
    }).catch(() => {});
  }, [active, bookId]);

  // Hard-clear all pending state when not active (toggle-off OR D-137 immersive
  // entry): without this, a pending timer can still fire a billable fetch after
  // the ghost goes inert, and the stale suggestion re-arms the (hidden) Tab
  // handler. Aborting the in-flight fetch here also means a suggestion that was
  // mid-flight when immersive opened never bills (the server honours the abort).
  useEffect(() => {
    if (active) return;
    setSuggestion(null);
    setStreamDone(false);
    clearStillWriting();
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    abortRef.current?.abort();
  }, [active, clearStillWriting]);

  const fetchSuggestion = useCallback(
    async (context: string) => {
      // D-134 (F4): while the cap wall is active and unexpired, skip the fetch
      // entirely — each doomed per-pause 429 is honest-server load and writer-
      // visible churn for nothing. The suppression self-expires after
      // WALL_RETRY_MS so the next pause honestly re-probes: still-capped
      // re-shows the banner, success clears it. This gate sits ABOVE all timer
      // plumbing (pause timers are cleared/re-armed as today) so that stays
      // untouched.
      if (isWallSuppressionActive(wallSinceRef.current, Date.now())) return;
      // Abort any pending request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // D5/D-140: a fresh fetch disarms accept until this stream settles.
      setStreamDone(false);
      setTimingMs(null);
      setServerTimingMs(null);
      // D-145: anchor felt-latency measurement at the instant the fetch fires.
      fetchStartRef.current = Date.now();
      setPending(true);
      try {
        const res = await fetch(`/api/books/${bookId}/ghost-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: context.slice(-500),
            chapterNumber,
            maxTokens: 60,
          }),
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          // Reading the error body is async — if typing resumed and aborted
          // the request meanwhile, stay silent rather than toast a stale wall
          // (the success path below already rechecks the abort flag).
          if (controller.signal.aborted) return;
          surfaceError(quickAssistErrorNotice(body));
          return;
        }

        // D5: a 200 is either the streamed SSE (the ghost-first gate) or, on a
        // stream-unsupported provider route, the atomic JSON fallback. The
        // content-type branch keeps the EXISTING json path byte-for-byte.
        const contentType = res.headers?.get?.("content-type") ?? "";
        if (contentType.includes("text/event-stream") && res.body) {
          // D-134 (F10): any successful (non-error) response clears the wall.
          setWallNotice(null);
          wallSinceRef.current = null;
          armStillWriting();
          let buf = "";
          for await (const frame of readQuickAssistFrames(
            res,
            controller.signal
          )) {
            if (controller.signal.aborted) return;
            if (frame.type === "token") {
              // First byte: swap the pending dots for the growing ghost.
              setPending(false);
              buf += frame.text ?? "";
              setSuggestion(buf.slice(0, MAX_SUGGESTION_LENGTH));
            } else if (frame.type === "done") {
              clearStillWriting();
              setWallNotice(null);
              wallSinceRef.current = null;
              // D5/D-140: the canonical full suggestion REPLACES accumulated
              // deltas, and ONLY now is accept armed — D-130 join / D-132 tap
              // operate on the final string.
              const canonical = (frame.text ?? buf).slice(
                0,
                MAX_SUGGESTION_LENGTH
              );
              setSuggestion(canonical);
              // D-145: display the FELT latency (fetch → accept-armed), not the
              // server's elapsedMs. The server figure rides along in the tooltip.
              setTimingMs(
                fetchStartRef.current !== null
                  ? Date.now() - fetchStartRef.current
                  : null
              );
              setServerTimingMs(
                typeof frame.elapsedMs === "number" ? frame.elapsedMs : null
              );
              setStreamDone(true);
            } else if (frame.type === "error") {
              // Post-first-text provider drop — flows through the SAME
              // quickAssistErrorNotice/surfaceError seam as a real 422/502.
              clearStillWriting();
              if (controller.signal.aborted) return;
              surfaceError(quickAssistErrorNotice(frame));
              setSuggestion(null);
            }
          }
          clearStillWriting();
        } else {
          // Non-stream 200 (fallback route) — existing JSON path unchanged.
          const data = await res.json();
          if (controller.signal.aborted) return;
          // D-134 (F10): ANY successful response clears the persistent cap-wall
          // banner + suppression window — even an empty suggestion. Otherwise a
          // stale 429 copy could linger next to a fresh, different error/toast.
          setWallNotice(null);
          wallSinceRef.current = null;
          if (data.suggestion) {
            setSuggestion(data.suggestion.slice(0, MAX_SUGGESTION_LENGTH));
          }
          // D-145: felt latency here too (fetch → armed); server elapsedMs kept
          // for the tooltip only.
          setTimingMs(
            fetchStartRef.current !== null
              ? Date.now() - fetchStartRef.current
              : null
          );
          if (typeof data.elapsedMs === "number") setServerTimingMs(data.elapsedMs);
          // Atomic result — nothing to wait on, so accept is armed immediately.
          setStreamDone(true);
        }
      } catch {
        // Abort is routine (typing resumed); anything else is a real network
        // failure the writer must hear about (D-129).
        if (!controller.signal.aborted) {
          surfaceError({
            message: QUICK_ASSIST_FALLBACK_MESSAGE,
            openSettings: false,
            upgrade: false,
          });
        }
      } finally {
        // Only the still-current request may clear the indicator — a stale
        // finally must not blank a newer request's pending state.
        if (abortRef.current === controller) {
          setPending(false);
          clearStillWriting();
        }
      }
    },
    [bookId, chapterNumber, surfaceError, armStillWriting, clearStillWriting]
  );

  // D-138: the ONE place the caret geometry becomes an overlay placement. Both
  // anchor sites (the initial pause-timer render and the scroll/resize
  // reposition) route through here so the clamp/flip decision can never drift
  // between them. window.innerWidth is read here (the only viewport touch) and
  // passed into the pure helper, which owns the right-edge clamp/flip.
  const buildPlacement = useCallback(
    (coords: { top: number; bottom: number; left: number }): OverlayPlacement =>
      ghostOverlayPlacement(
        { top: coords.top, bottom: coords.bottom, left: coords.left },
        window.innerWidth
      ),
    []
  );

  // Monitor editor changes
  useEffect(() => {
    // D-137: gated on `active`, not `enabled`, so entering immersive removes
    // this "update" listener. The debounced immersive→tiptap setContent still
    // emits "update" events, but with no listener attached they no longer arm a
    // pause timer / billable fetch behind the z-[100] overlay.
    if (!editor || !active) return;

    const handleUpdate = () => {
      // Clear existing suggestion on any edit; kill the in-flight request
      // for pre-edit text so it can't resolve into a stale suggestion
      setSuggestion(null);
      setStreamDone(false);
      clearStillWriting();
      if (abortRef.current) abortRef.current.abort();

      // Reset pause timer
      if (pauseTimer.current) clearTimeout(pauseTimer.current);

      const text = editor.getText();
      lastTextRef.current = text;

      // Don't suggest if text is too short
      if (text.length < MIN_CONTEXT_LENGTH) return;

      // Start pause timer
      pauseTimer.current = setTimeout(() => {
        // Only fetch if text hasn't changed during the pause
        if (editor.getText() === lastTextRef.current) {
          fetchSuggestion(lastTextRef.current);

          // Calculate cursor position for rendering. D-138: the raw caret
          // coords go through buildPlacement so the overlay is clamped (or
          // flipped to the next line) instead of wrapping into a one-word
          // column at the right edge.
          const { view } = editor;
          const { from } = view.state.selection;
          const coords = view.coordsAtPos(from);
          if (coords) {
            setPosition(buildPlacement(coords));
          }
        }
      }, PAUSE_MS);
    };

    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
      // Cancel pending trigger + in-flight request on disable/chapter switch
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [editor, active, fetchSuggestion, buildPlacement, clearStillWriting]);

  // Dismiss on selection-only changes (click elsewhere without editing) so
  // Tab can never insert at a position the ghost isn't rendered at. Extended to
  // the pending phase: if the cursor moves while a fetch is in flight, cancel
  // it — otherwise the request resolves into a ghost anchored to the OLD
  // position and a Tab would insert at the new cursor.
  useEffect(() => {
    if (!editor || (!suggestion && !pending)) return;
    const dismiss = () => {
      setSuggestion(null);
      setPending(false);
      setStreamDone(false);
      clearStillWriting();
      abortRef.current?.abort();
    };
    editor.on("selectionUpdate", dismiss);
    return () => {
      editor.off("selectionUpdate", dismiss);
    };
  }, [editor, suggestion, pending, clearStillWriting]);

  // Keep the fixed-position overlay anchored to the cursor: reposition on
  // scroll (capture catches the editor's inner scroll container) and resize,
  // dismissing if the cursor position can no longer be resolved. Active during
  // the pending phase too, so the D5 loading dots track the cursor exactly like
  // the ghost text does.
  useEffect(() => {
    if ((!suggestion && !pending) || !editor) return;

    const reposition = () => {
      try {
        const { from } = editor.view.state.selection;
        const coords = editor.view.coordsAtPos(from);
        // D-138: same clamp/flip path as the initial anchor — a resize (e.g. the
        // soft keyboard opening) that narrows the viewport must re-decide inline
        // vs. flipped, not just move the raw point.
        setPosition(buildPlacement(coords));
      } catch {
        // Position is stale (e.g. doc changed) — dismiss instead of floating
        // detached; clear the pending dots for the same reason.
        setSuggestion(null);
        setPending(false);
        setStreamDone(false);
        clearStillWriting();
      }
    };

    window.addEventListener("scroll", reposition, { capture: true, passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
    };
  }, [suggestion, pending, editor, buildPlacement, clearStillWriting]);

  // D-132: single accept path shared by the Tab key AND the overlay tap.
  // Insert at the cursor, joining with a space when both sides are word-like
  // (D-130: raw insert glued "the"+"dream" → "thedream"), then return focus so
  // the writer keeps typing with the cursor after the inserted text. Reads the
  // last TWO doc chars so joinGhostSuggestion can disambiguate a trailing quote
  // (apostrophe glues; closing quote after sentence punctuation needs a space).
  // Deliberately does NOT require editor.isFocused — the overlay tap on a phone
  // is unambiguous even when the editor holds no focus.
  const acceptSuggestion = useCallback(() => {
    // D5/D-140: accept is ARMED ONLY on the `done` frame. Mid-stream Tab/tap is
    // inert, so a partial fragment can never be inserted.
    if (!editor || !suggestion || !streamDone) return;
    // D-144: the inserted bytes go through the SAME join the overlay previews,
    // so what lands is byte-identical to what the writer was reading.
    editor.commands.insertContent(
      joinGhostSuggestion(ghostCharsBefore(editor), suggestion)
    );
    setSuggestion(null);
    setStreamDone(false);
    editor.commands.focus();
  }, [editor, suggestion, streamDone]);

  // D-132 (F3+F6): coarse-pointer tap-vs-drag discrimination. pointerdown
  // preventDefaults so the tap can't move the caret / blur the editor (which
  // would trip the selectionUpdate dismiss and self-destruct the ghost) and
  // records the gesture; a pointermove past TAP_SLOP_PX marks it a scroll/drag;
  // only a pointerup that stayed within slop accepts. A scroll that merely
  // STARTS on the overlay therefore never inserts text.
  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    pointerGestureRef.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      cancelled: false,
    };
  };
  const handleOverlayPointerMove = (e: React.PointerEvent) => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.id !== e.pointerId || gesture.cancelled) return;
    if (
      Math.abs(e.clientX - gesture.x) > TAP_SLOP_PX ||
      Math.abs(e.clientY - gesture.y) > TAP_SLOP_PX
    ) {
      pointerGestureRef.current = { ...gesture, cancelled: true };
    }
  };
  const handleOverlayPointerUp = (e: React.PointerEvent) => {
    const gesture = pointerGestureRef.current;
    pointerGestureRef.current = null;
    if (!gesture || gesture.id !== e.pointerId || gesture.cancelled) return;
    // D5/D-140: a tap before the stream settles is a no-op (acceptSuggestion
    // also guards, this keeps the intent explicit at the gesture boundary).
    if (!streamDone) return;
    acceptSuggestion();
  };

  // Handle Tab to accept, Escape to dismiss. Gated on `active` (enabled and not
  // immersive) and editor focus: a document-level capture handler must never
  // insert into a pane that doesn't own the keyboard (split view), after
  // toggle-off, or from behind the immersive overlay (D-137).
  useEffect(() => {
    if (!suggestion || !editor || !active) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (!editor.isFocused) return; // Tab belongs to another pane/input
        // D5/D-140: Tab is inert until the stream settles (accept armed on done).
        if (!streamDone) return;
        e.preventDefault();
        acceptSuggestion();
      } else if (e.key === "Escape") {
        setSuggestion(null);
        setStreamDone(false);
        clearStillWriting();
        // D5/D-142 (CSM-1): a dismiss during an ACTIVE stream must abort the
        // in-flight fetch, like every other dismiss path (handleUpdate,
        // selectionUpdate, disabled cleanup). Without it the un-aborted stream
        // keeps running: its `done` frame slips past the consumer's
        // aborted-guard and RESURRECTS the ghost (setSuggestion) + ARMS accept
        // (setStreamDone), and — since req.signal never aborts — the server
        // still writes a usage_record and advances the free-tier meter for a
        // suggestion the writer explicitly rejected.
        abortRef.current?.abort();
      } else if (e.key.length === 1) {
        // User started typing — dismiss (same resurrect-bill abort as Escape;
        // handleUpdate also aborts on the trailing editor "update", but the
        // dismiss must be self-contained rather than rely on that ordering).
        setSuggestion(null);
        setStreamDone(false);
        clearStillWriting();
        abortRef.current?.abort();
      }
    };

    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [suggestion, editor, active, acceptSuggestion, streamDone, clearStillWriting]);

  // D-137: immersive suppresses render too — the overlay/banner would only sit
  // (invisibly) under the z-[100] surface, and the effects above have already
  // cleared any live state, so there is nothing to paint.
  if (!active) return null;

  // D-132: pointer-aware accept hint — the flagship feature must not advertise
  // only a hardware key on a phone soft keyboard.
  const acceptHint = coarsePointer ? "Tap to accept" : "Tab ↹";

  // D5 (§7) / D-145: the measured-latency chip — only on a slow hit (> 2.5s,
  // the D-146 slow-only gate, deliberately UNCHANGED), so warm suggestions stay
  // clean. The DISPLAYED number is the client-felt latency (fetch → accept
  // armed); the server's own elapsedMs rides in the tooltip so the honest server
  // figure stays available without misrepresenting the wait the writer felt.
  const timingChip: ReactNode =
    streamDone && timingMs !== null && timingMs > TIMING_CHIP_MIN_MS ? (
      <span
        title={
          serverTimingMs !== null
            ? `server ${(serverTimingMs / 1000).toFixed(1)}s`
            : undefined
        }
        className="ml-1 align-middle font-sans text-[10px] not-italic tabular-nums text-muted-foreground/40"
      >
        ~{(timingMs / 1000).toFixed(1)}s
      </span>
    ) : null;

  // D5/D-140: while tokens are still flowing the ghost shows WITHOUT the accept
  // pill — a thin pulsing caret signals live text and that accept is not yet
  // armed. The pill appears only on the `done` frame.
  const streamingCaret: ReactNode = (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1em] w-px animate-pulse bg-muted-foreground/40 align-middle"
    />
  );

  // D-144: what the overlay RENDERS must equal what accept INSERTS. D-130's
  // join-space is applied on accept, so a raw-suggestion preview showed
  // "andthe" while accept produced "and the". Derive the preview through the
  // SAME joinGhostSuggestion (same charsBefore) so the ghost the writer reads is
  // byte-identical to the text that lands on Tab/tap.
  const previewSuggestion =
    suggestion && editor
      ? joinGhostSuggestion(ghostCharsBefore(editor), suggestion)
      : suggestion;

  // D-134: the cap-wall banner is independent of the cursor overlay — the wall
  // never yields a suggestion, so it must render even with no position.
  // F5: TOP-anchored, not bottom-anchored. A bottom banner is occluded by the
  // on-screen keyboard on a real phone (the writer is mid-sentence when the cap
  // hits), reintroducing the D-129 "silent wall" on the exact device class
  // D-134 claims to fix. The offset clears the fixed app chrome: 3rem AppHeader
  // (app-header.tsx h-12) + ~2.5rem sticky editor toolbar (editor-toolbar.tsx
  // py-1 + h-8) + the notch safe area. Same anchoring on md+ for consistency;
  // being at the top keeps it trivially clear of the h-14 mobile bottom nav.
  // F9 note / D-137 (RESOLVED via shape (b)): this z-40 banner and the z-50
  // ghost overlay render BENEATH the z-[100] immersive focus overlay, so a cap
  // wall (or any suggestion) produced during immersive writing would be
  // invisible. Rather than raise z above the distraction-free surface — which
  // fights the deliberate chrome suppression in immersive (see manuscript-
  // editor.tsx's conflict toast/dialog defer-to-exit note) — ghost fetching is
  // suppressed outright while immersive (the `active` gate above). The debounced
  // immersive→tiptap setContent no longer arms a fetch, so there is no billable-
  // but-invisible suggestion and no silent 429 wall to surface in the first
  // place. The non-immersive wall below is unchanged.
  const wallBanner: ReactNode = wallNotice ? (
    <div
      role="alert"
      className="fixed inset-x-2 top-[calc(6rem+env(safe-area-inset-top))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-lg"
    >
      <span className="flex-1">{wallNotice.message}</span>
      {/* F8: >=44px touch targets so the wall can be acted on / dismissed by
          thumb without fat-fingering the wrong control. */}
      <button
        type="button"
        onClick={() => router.push("/settings/billing")}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Upgrade
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setWallNotice(null)}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  ) : null;

  // Cursor overlay: the D5 pending dots or the ghost suggestion.
  let overlay: ReactNode = null;
  if (position) {
    if (suggestion) {
      // F1: overlay interactivity is gated on the pointer type.
      if (coarsePointer) {
        // Coarse pointer (phone): the whole ghost text is a generous tap target.
        // Tap-vs-drag discrimination (F3+F6) lives in the pointer handlers so a
        // scroll that starts on the ghost can't insert. tabIndex -1 keeps it out
        // of the tab order so it never steals focus from the editor.
        overlay = (
          <span
            role="button"
            aria-label="Accept suggestion"
            tabIndex={-1}
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            className="fixed z-50 cursor-pointer font-serif text-lg text-muted-foreground/30 italic select-none whitespace-pre-wrap"
            // D-138: maxWidth is clamped/flipped by ghostOverlayPlacement, not a
            // hard 500px — near the right edge that raw cap wrapped the ghost
            // into a one-word column that buried this tap target.
            style={{ top: position.top, left: position.left, maxWidth: position.maxWidth }}
          >
            {previewSuggestion}
            {/* D5/D-140: the pill (accept armed) appears ONLY on the done frame;
                a mid-stream ghost shows the pulsing caret instead.
                F7: a real, readable pill — the old text-[10px]/20% hint was
                invisible on a phone, so the touch affordance stayed undiscovered. */}
            {streamDone ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 align-middle text-xs font-sans not-italic text-foreground/70">
                {acceptHint}
                {timingChip}
              </span>
            ) : (
              streamingCaret
            )}
          </span>
        );
      } else {
        // F1: fine pointer (desktop) reverts to the original PASSIVE overlay —
        // pointer-events-none, no role=button, so a click passes through to the
        // editor and moves the caret (dismissing via selectionUpdate as before)
        // instead of accepting. Accept stays on the Tab key; the hint is the
        // subtle "Tab ↹" exactly as it was.
        overlay = (
          <span
            className="pointer-events-none fixed z-50 font-serif text-lg text-muted-foreground/30 italic select-none whitespace-pre-wrap"
            // D-138: clamped/flipped maxWidth (see the coarse-pointer overlay).
            style={{ top: position.top, left: position.left, maxWidth: position.maxWidth }}
          >
            {previewSuggestion}
            {/* D5/D-140: the subtle "Tab ↹" hint (accept armed) only on done;
                mid-stream shows the pulsing caret. */}
            {streamDone ? (
              <span className="ml-2 text-[10px] text-muted-foreground/20 not-italic font-sans">
                {acceptHint}
                {timingChip}
              </span>
            ) : (
              streamingCaret
            )}
          </span>
        );
      }
    } else if (pending) {
      // D5: visible affordance at the cursor while the suggestion is in flight —
      // the wait between the typing pause and the ghost render was blind.
      overlay = (
        <span
          role="status"
          aria-label="Generating suggestion"
          className="pointer-events-none fixed z-50 animate-pulse font-serif text-lg text-muted-foreground/40 select-none"
          style={{ top: position.top, left: position.left }}
        >
          &middot;&middot;&middot;
        </span>
      );
    }
  }

  // D5 (§7): the >8s "still writing…" affordance — TOP-anchored in the cursor
  // overlay (not a bottom sonner toast, so it stays clear of the D-139 occlusion
  // class). Lets the design make an honest D2/reliability claim: a slow stream
  // is visibly still working, never a silent hang.
  const stillWritingNotice: ReactNode =
    stillWriting && !streamDone && position ? (
      <span
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed z-50 rounded bg-background/90 px-1.5 py-0.5 font-sans text-[10px] not-italic text-muted-foreground shadow-sm"
        style={{ top: Math.max(0, position.top - 22), left: position.left }}
      >
        Still writing…
      </span>
    ) : null;

  if (!overlay && !wallBanner && !stillWritingNotice) return null;
  return (
    <>
      {overlay}
      {stillWritingNotice}
      {wallBanner}
    </>
  );
}
