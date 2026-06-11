"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { useAgentUIStore } from "@/stores/agent-ui-store";

/** Visible reminder of the send/newline keys (also documents Shift+Enter). */
const KEYBOARD_HINT = "Enter to send · Shift+Enter for new line";

interface FloatingAgentInputProps {
  editor: Editor;
  bookId: string;
  onClose: () => void;
  /**
   * Whether the textarea grabs focus on mount. Selection-triggered opens
   * must pass `false` (mid-typing focus steal); explicit opens (toolbar
   * "Agent Quick Chat") pass `true`. Defaults to `true` (legacy behavior).
   */
  autoFocus?: boolean;
}

export function FloatingAgentInput({
  editor,
  bookId,
  onClose,
  autoFocus = true,
}: FloatingAgentInputProps) {
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const openWithMessage = useAgentUIStore((s) => s.openWithMessage);

  // Calculate position from selection
  const updatePosition = useCallback(() => {
    const { from, to } = editor.state.selection;
    if (from === to) {
      onClose();
      return;
    }

    try {
      const coords = editor.view.coordsAtPos(to);
      const editorEl = editor.view.dom;
      const scrollParent = editorEl.closest(".overflow-y-auto");
      const parentRect = scrollParent?.getBoundingClientRect() ?? editorEl.getBoundingClientRect();

      setPosition({
        top: coords.bottom - parentRect.top + (scrollParent?.scrollTop ?? 0) + 8,
        left: Math.max(40, coords.left - parentRect.left),
      });
    } catch {
      onClose();
    }
  }, [editor, onClose]);

  useEffect(() => {
    updatePosition();
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [updatePosition, autoFocus]);

  // Close on empty selection
  useEffect(() => {
    const handler = () => {
      const { from, to } = editor.state.selection;
      if (from === to) onClose();
    };
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor, onClose]);

  // Close on Escape — only when this widget owns focus. A document-wide
  // unconditional handler would close on Escapes meant for OTHER overlays
  // (review tooltip, dropdowns) and yank focus into the editor mid-action.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!containerRef.current?.contains(document.activeElement)) return;
      if (!editor.isDestroyed) {
        editor.commands.focus();
      }
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    const truncated = selectedText.length > 200
      ? selectedText.slice(0, 200) + "..."
      : selectedText;

    openWithMessage(bookId, `Re: \u00AB${truncated}\u00BB\n\n${trimmed}`);
    onClose();
  };

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Agent quick chat"
      className="absolute z-20 rounded-lg border bg-background shadow-lg p-1.5"
      style={{ top: position.top, left: position.left, width: 320 }}
    >
      <div className="flex items-center gap-1.5">
        <textarea
          ref={inputRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask about this text..."
          aria-label="Ask the agent about the selected text"
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-h-[28px] max-h-[80px] py-1 px-1.5"
          rows={1}
        />
        <Button
          size="sm"
          className="shrink-0 gap-1 h-7 px-2.5 text-xs"
          onClick={handleSend}
          disabled={!message.trim()}
        >
          Send
        </Button>
      </div>
      <p className="px-1.5 pt-0.5 text-[10px] text-muted-foreground/70 select-none">
        {KEYBOARD_HINT}
      </p>
    </div>
  );
}
