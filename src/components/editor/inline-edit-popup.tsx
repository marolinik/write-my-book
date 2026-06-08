"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Check,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useInlineEdit } from "@/hooks/use-inline-edit";
import type { InlineEditSuggestion } from "@/lib/validation";

// ── Preset AI action pills ─────────────────────────────────────

const AI_ACTIONS = [
  { id: "rewrite", label: "Rewrite", emoji: "\u{1F504}" },
  { id: "improve", label: "Improve", emoji: "\u2728" },
  { id: "shorten", label: "Shorten", emoji: "\u2702\uFE0F" },
  { id: "extend", label: "Extend", emoji: "\u{1F4DD}" },
  { id: "revise", label: "Revise", emoji: "\u{1F527}" },
  { id: "dialogue", label: "More dialogue", emoji: "\u{1F4AC}" },
  { id: "vivid", label: "More vivid", emoji: "\u{1F3A8}" },
  { id: "formal", label: "More formal", emoji: "\u{1F4CB}" },
] as const;

// ────────────────────────────────────────────────────────────────

interface InlineEditPopupProps {
  editor: Editor;
  bookId: string;
  onClose: () => void;
  /** When provided, auto-submits with this instruction on mount. */
  initialInstruction?: string;
}

export function InlineEditPopup({
  editor,
  bookId,
  onClose,
  initialInstruction,
}: InlineEditPopupProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [instruction, setInstruction] = useState(initialInstruction ?? "");
  const [suggestions, setSuggestions] = useState<InlineEditSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<"instruction" | "loading" | "results">("instruction");
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inlineEdit = useInlineEdit(bookId);

  // Calculate popup position from editor selection
  useEffect(() => {
    const { view } = editor;
    const { from, to } = view.state.selection;
    if (from === to) {
      onClose();
      return;
    }

    const endCoords = view.coordsAtPos(to);
    const editorRect = view.dom.getBoundingClientRect();

    setPosition({
      top: endCoords.bottom - editorRect.top + 8,
      left: endCoords.left - editorRect.left,
    });
  }, [editor, onClose]);

  // Focus input when popup opens
  useEffect(() => {
    if (phase === "instruction") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [phase]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const getSelectedText = useCallback(() => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, "\n");
  }, [editor]);

  const getSurroundingContext = useCallback(() => {
    const { from, to } = editor.state.selection;
    const doc = editor.state.doc;
    const contextStart = Math.max(0, from - 500);
    const contextEnd = Math.min(doc.content.size, to + 500);
    const before = doc.textBetween(contextStart, from, "\n");
    const after = doc.textBetween(to, contextEnd, "\n");
    return `${before}\n[SELECTED TEXT]\n${after}`;
  }, [editor]);

  const handleSubmit = useCallback(
    async (overrideInstruction?: string) => {
      const selectedText = getSelectedText();
      if (!selectedText.trim()) {
        onClose();
        return;
      }

      const finalInstruction = overrideInstruction ?? instruction.trim();
      setPhase("loading");

      try {
        const result = await inlineEdit.mutateAsync({
          selectedText,
          surroundingContext: getSurroundingContext(),
          instruction: finalInstruction || undefined,
          count: 3,
        });

        if (result.suggestions.length === 0) {
          setPhase("instruction");
          return;
        }

        setSuggestions(result.suggestions);
        setActiveIndex(0);
        setPhase("results");
      } catch {
        setPhase("instruction");
      }
    },
    [getSelectedText, getSurroundingContext, instruction, inlineEdit, onClose]
  );

  // Auto-submit when opened with an initialInstruction (e.g. from context menu)
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (initialInstruction && !autoSubmittedRef.current && position) {
      autoSubmittedRef.current = true;
      handleSubmit(initialInstruction);
    }
  }, [initialInstruction, position, handleSubmit]);

  const handleActionClick = useCallback(
    (actionLabel: string) => {
      setInstruction(actionLabel);
      handleSubmit(actionLabel);
    },
    [handleSubmit]
  );

  const handleAccept = useCallback(() => {
    if (!suggestions[activeIndex]) return;

    const { from, to } = editor.state.selection;
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, suggestions[activeIndex].text)
      .run();

    onClose();
  }, [editor, suggestions, activeIndex, onClose]);

  const handlePrev = useCallback(() => {
    setActiveIndex((i) => (i > 0 ? i - 1 : suggestions.length - 1));
  }, [suggestions.length]);

  const handleNext = useCallback(() => {
    setActiveIndex((i) => (i < suggestions.length - 1 ? i + 1 : 0));
  }, [suggestions.length]);

  // Keyboard navigation in results
  useEffect(() => {
    if (phase !== "results") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleAccept();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [phase, handlePrev, handleNext, handleAccept]);

  if (!position) return null;

  return (
    <div
      ref={popupRef}
      className="absolute z-50 w-[420px] rounded-lg border bg-popover text-popover-foreground shadow-lg"
      style={{ top: position.top, left: Math.max(0, position.left - 200) }}
    >
      {/* Instruction phase */}
      {phase === "instruction" && (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-medium">AI Edit</span>
            <Badge variant="secondary" className="text-xs ml-auto">
              F2
            </Badge>
          </div>

          {/* Action pills */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {AI_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-border text-muted-foreground hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-500/5 transition-colors"
                onClick={() => handleActionClick(action.label)}
              >
                <span>{action.emoji}</span>
                {action.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <Input
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Or describe what you want..."
              className="text-sm h-8"
            />
            <div className="flex items-center gap-2 mt-2">
              <Button type="submit" size="sm" className="h-7 text-xs gap-1">
                <Sparkles className="h-3 w-3" />
                Generate
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onClose}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Loading phase */}
      {phase === "loading" && (
        <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating suggestions...
        </div>
      )}

      {/* Results phase */}
      {phase === "results" && suggestions.length > 0 && (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <Badge variant="outline" className="text-xs">
              {suggestions[activeIndex]?.label}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {activeIndex + 1}/{suggestions.length}
            </span>
          </div>

          <div className="rounded-md border bg-muted/50 p-2 text-sm leading-relaxed max-h-[200px] overflow-y-auto">
            {suggestions[activeIndex]?.text}
          </div>

          <div className="flex items-center gap-1 mt-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handlePrev}
              disabled={suggestions.length <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleNext}
              disabled={suggestions.length <= 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onClose}
              >
                <X className="h-3 w-3" />
                Reject
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleAccept}
              >
                <Check className="h-3 w-3" />
                Accept
              </Button>
            </div>
          </div>

          <div className="text-[10px] text-muted-foreground mt-1">
            Arrow keys to browse, Enter to accept, Esc to cancel
          </div>
        </div>
      )}
    </div>
  );
}
