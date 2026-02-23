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
    try {
      await onSend(trimmed);
      setValue("");
      // Reset height after clearing
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      });
    } catch {
      // Don't clear input on error — let user retry
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
