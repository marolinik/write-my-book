"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface InlineEditableTitleProps {
  bookId: string;
  chapterId: string;
  initialTitle: string;
  placeholder?: string;
}

export function InlineEditableTitle({
  bookId,
  chapterId,
  initialTitle,
  placeholder = "Untitled",
}: InlineEditableTitleProps) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = async () => {
    const trimmed = title.trim();
    if (trimmed === initialTitle) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}/chapters/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed || null }),
      });
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["books", bookId] });
      } else {
        // P2-56: a failed save is said, not silently reverted.
        setTitle(initialTitle);
        toast.error(t.appUI.titleSaveFailed);
      }
    } catch {
      setTitle(initialTitle);
      toast.error(t.appUI.titleSaveFailed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setTitle(initialTitle);
            setEditing(false);
          }
        }}
        disabled={saving}
        className="h-7 text-sm px-1.5"
        placeholder={placeholder}
      />
    );
  }

  // P2-56: a real button, so a keyboard can start the rename (Enter / Space);
  // this is the only rename path on the book overview.
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="cursor-pointer text-left hover:bg-muted/50 rounded px-1 -mx-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={t.appUI.clickToEditTitle}
      aria-label={`${t.appUI.clickToEditTitle}: ${initialTitle || placeholder}`}
    >
      {initialTitle || (
        <span className="text-muted-foreground italic">{placeholder}</span>
      )}
    </button>
  );
}
