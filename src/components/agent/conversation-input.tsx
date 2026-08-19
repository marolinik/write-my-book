"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ConversationInputProps {
  onSend: (message: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function ConversationInput({
  onSend,
  disabled,
  placeholder = "Type a message...",
}: ConversationInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit content
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || sending) return;
    setSending(true);
    // D-178: clear on submit, not on settle. The discuss hook appends the same
    // text as a writer bubble immediately, so holding it here put the writer's
    // message on screen TWICE for the whole turn — legible for 19-36 s once the
    // wait became honest, and indistinguishable from "it never sent".
    setValue("");
    // Reset height after clearing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
    try {
      await onSend(trimmed);
    } catch {
      // Failed or cancelled: put the text back so a retry keeps it. The caller
      // is responsible for SAYING what happened (discuss-turn-notice.ts) — a
      // restored box on its own would be a silent wall.
      setValue(trimmed);
    } finally {
      setSending(false);
    }
    textareaRef.current?.focus();
  }, [value, disabled, sending, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t p-3 shrink-0">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="min-h-[36px] max-h-[200px] resize-none text-sm"
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={disabled || sending || !value.trim()}
        className="shrink-0"
      >
        <SendIcon className="size-4" />
      </Button>
    </div>
  );
}
