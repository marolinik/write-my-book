"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { useAgentUIStore } from "@/stores/agent-ui-store";

interface FloatingAgentInputProps {
  editor: Editor;
  bookId: string;
  onClose: () => void;
}

export function FloatingAgentInput({
  editor,
  bookId,
  onClose,
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
    inputRef.current?.focus();
  }, [updatePosition]);

  // Close on empty selection
  useEffect(() => {
    const handler = () => {
      const { from, to } = editor.state.selection;
      if (from === to) onClose();
    };
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor, onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

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
      className="absolute z-20 flex items-center gap-1.5 rounded-lg border bg-background shadow-lg p-1.5"
      style={{ top: position.top, left: position.left, width: 320 }}
    >
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
  );
}
