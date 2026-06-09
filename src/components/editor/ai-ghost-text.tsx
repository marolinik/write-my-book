"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

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
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastTextRef = useRef<string>("");

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const fetchSuggestion = useCallback(
    async (context: string) => {
      // Abort any pending request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

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

        if (!res.ok || controller.signal.aborted) return;

        const data = await res.json();
        if (data.suggestion && !controller.signal.aborted) {
          setSuggestion(data.suggestion.slice(0, MAX_SUGGESTION_LENGTH));
        }
      } catch {
        // Aborted or network error — ignore
      }
    },
    [bookId, chapterNumber]
  );

  // Monitor editor changes
  useEffect(() => {
    if (!editor || !enabled) return;

    const handleUpdate = () => {
      // Clear existing suggestion on any edit
      setSuggestion(null);

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
    };
  }, [editor, enabled, fetchSuggestion]);

  // Handle Tab to accept, Escape to dismiss
  useEffect(() => {
    if (!suggestion || !editor) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab" && suggestion) {
        e.preventDefault();
        // Insert the suggestion at cursor
        editor.commands.insertContent(suggestion);
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
  }, [suggestion, editor]);

  if (!suggestion || !position || !enabled) return null;

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
