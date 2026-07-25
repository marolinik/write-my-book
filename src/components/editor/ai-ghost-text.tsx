"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import { joinGhostSuggestion } from "./ghost-text-join";
import {
  quickAssistErrorNotice,
  shouldSurfaceGhostError,
  QUICK_ASSIST_FALLBACK_MESSAGE,
  type GhostErrorMark,
  type QuickAssistErrorNotice,
} from "./quick-assist-client-errors";

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
}

const PAUSE_MS = 1500; // 1.5 seconds of inactivity triggers a suggestion
const MIN_CONTEXT_LENGTH = 50; // Need at least 50 chars of context
const MAX_SUGGESTION_LENGTH = 150; // Cap ghost text at ~1 sentence

export function AIGhostText({
  editor,
  bookId,
  chapterNumber,
  enabled,
}: AIGhostTextProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // D5: the fetch wait was blind — no affordance between pause and render.
  const [pending, setPending] = useState(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastTextRef = useRef<string>("");
  const lastErrorRef = useRef<GhostErrorMark | null>(null);
  const router = useRouter();

  // D-129: the server answers the cap wall (429), the reasoning-model
  // backstop (422 MODEL_NO_QUICK_SUGGEST), and 5xx with honest copy — it must
  // reach the writer instead of dying in a silent early-return. Throttled so
  // the per-pause retrigger can't storm the same toast.
  const surfaceError = useCallback(
    (notice: QuickAssistErrorNotice) => {
      const now = Date.now();
      if (!shouldSurfaceGhostError(lastErrorRef.current, notice.message, now)) {
        return;
      }
      lastErrorRef.current = { message: notice.message, at: now };
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Hard-clear all pending state when disabled: without this, a pending
  // timer can still fire a billable fetch after toggle-off, and the stale
  // suggestion re-arms the (hidden) Tab handler.
  useEffect(() => {
    if (enabled) return;
    setSuggestion(null);
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    abortRef.current?.abort();
  }, [enabled]);

  const fetchSuggestion = useCallback(
    async (context: string) => {
      // Abort any pending request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

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
          surfaceError(quickAssistErrorNotice(body));
          return;
        }

        const data = await res.json();
        if (data.suggestion && !controller.signal.aborted) {
          setSuggestion(data.suggestion.slice(0, MAX_SUGGESTION_LENGTH));
        }
      } catch {
        // Abort is routine (typing resumed); anything else is a real network
        // failure the writer must hear about (D-129).
        if (!controller.signal.aborted) {
          surfaceError({
            message: QUICK_ASSIST_FALLBACK_MESSAGE,
            openSettings: false,
          });
        }
      } finally {
        // Only the still-current request may clear the indicator — a stale
        // finally must not blank a newer request's pending state.
        if (abortRef.current === controller) setPending(false);
      }
    },
    [bookId, chapterNumber, surfaceError]
  );

  // Monitor editor changes
  useEffect(() => {
    if (!editor || !enabled) return;

    const handleUpdate = () => {
      // Clear existing suggestion on any edit; kill the in-flight request
      // for pre-edit text so it can't resolve into a stale suggestion
      setSuggestion(null);
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

          // Calculate cursor position for rendering
          const { view } = editor;
          const { from } = view.state.selection;
          const coords = view.coordsAtPos(from);
          if (coords) {
            setPosition({
              top: coords.top,
              left: coords.left,
            });
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
  }, [editor, enabled, fetchSuggestion]);

  // Dismiss on selection-only changes (click elsewhere without editing) so
  // Tab can never insert at a position the ghost isn't rendered at.
  useEffect(() => {
    if (!editor || !suggestion) return;
    const dismiss = () => setSuggestion(null);
    editor.on("selectionUpdate", dismiss);
    return () => {
      editor.off("selectionUpdate", dismiss);
    };
  }, [editor, suggestion]);

  // Keep the fixed-position overlay anchored to the cursor: reposition on
  // scroll (capture catches the editor's inner scroll container) and resize,
  // dismissing if the cursor position can no longer be resolved.
  useEffect(() => {
    if (!suggestion || !editor) return;

    const reposition = () => {
      try {
        const { from } = editor.view.state.selection;
        const coords = editor.view.coordsAtPos(from);
        setPosition({ top: coords.top, left: coords.left });
      } catch {
        // Position is stale (e.g. doc changed) — dismiss instead of floating detached
        setSuggestion(null);
      }
    };

    window.addEventListener("scroll", reposition, { capture: true, passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
    };
  }, [suggestion, editor]);

  // Handle Tab to accept, Escape to dismiss. Gated on `enabled` and editor
  // focus: a document-level capture handler must never insert into a pane
  // that doesn't own the keyboard (split view) or after toggle-off.
  useEffect(() => {
    if (!suggestion || !editor || !enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (!editor.isFocused) return; // Tab belongs to another pane/input
        e.preventDefault();
        // Insert at cursor, joining with a space when both sides are
        // word-like (D-130: raw insert glued "the"+"dream" → "thedream").
        const { from } = editor.state.selection;
        const charBefore =
          from > 0
            ? editor.state.doc.textBetween(Math.max(0, from - 1), from)
            : "";
        editor.commands.insertContent(
          joinGhostSuggestion(charBefore, suggestion)
        );
        setSuggestion(null);
      } else if (e.key === "Escape") {
        setSuggestion(null);
      } else if (e.key.length === 1) {
        // User started typing — dismiss
        setSuggestion(null);
      }
    };

    document.addEventListener("keydown", handler, { capture: true });
    return () => document.removeEventListener("keydown", handler, { capture: true });
  }, [suggestion, editor, enabled]);

  if (!position || !enabled) return null;

  // D5: visible affordance at the cursor while the suggestion is in flight —
  // the wait between the typing pause and the ghost render was blind.
  if (!suggestion) {
    if (!pending) return null;
    return (
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

  // Render ghost text as a positioned overlay
  return (
    <span
      className="pointer-events-none fixed z-50 font-serif text-lg text-muted-foreground/30 italic select-none whitespace-pre-wrap"
      style={{
        top: position.top,
        left: position.left,
        maxWidth: "500px",
      }}
    >
      {suggestion}
      <span className="ml-2 text-[10px] text-muted-foreground/20 not-italic font-sans">
        Tab ↹
      </span>
    </span>
  );
}
