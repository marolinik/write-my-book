"use client";

import { useState, useCallback, useRef } from "react";
import { SparklesIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api-client";
import { toast } from "sonner";

/**
 * J: "Describe Your Change" — Free-form inline AI rewrite.
 * Select text → type what you want → AI rewrites it.
 * Inspired by Apple Intelligence's "describe your change" feature.
 * 
 * Examples: "make this more tense", "add sensory detail",
 * "slow the pacing", "make her sound angrier"
 */

interface DescribeYourChangeProps {
  bookId: string;
  /** The selected text to rewrite */
  selectedText: string;
  /** Called with the rewritten text when accepted */
  onAccept: (newText: string) => void;
  /** Called when dismissed */
  onDismiss: () => void;
  /** Position for the popup */
  position?: { top: number; left: number };
}

export function DescribeYourChange({
  bookId,
  selectedText,
  onAccept,
  onDismiss,
  position,
}: DescribeYourChangeProps) {
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = useCallback(async () => {
    if (!instruction.trim() || isLoading) return;
    setIsLoading(true);
    setResult(null);

    try {
      const response = await fetchJson<{ suggestions?: Array<{ newText: string }>; rewrittenText?: string }>(`/api/books/${bookId}/inline-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalText: selectedText,
          instruction: instruction.trim(),
        }),
      });
      // Handle both response shapes
      const rewritten = response.rewrittenText ?? response.suggestions?.[0]?.newText ?? null;
      setResult(rewritten);
    } catch {
      toast.error("Failed to generate rewrite");
    } finally {
      setIsLoading(false);
    }
  }, [bookId, selectedText, instruction, isLoading]);

  const style = position
    ? { position: "fixed" as const, top: position.top + 24, left: position.left, zIndex: 50 }
    : {};

  return (
    <div
      className="w-80 rounded-lg border bg-background shadow-xl p-3 space-y-2"
      style={style}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1">
          <SparklesIcon className="size-3 text-primary" />
          Describe your change
        </span>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
          <XIcon className="size-3" />
        </button>
      </div>

      {/* Original text preview */}
      <div className="rounded bg-muted/50 p-2 text-xs line-clamp-3 italic text-muted-foreground">
        "{selectedText.slice(0, 200)}{selectedText.length > 200 ? "..." : ""}"
      </div>

      {/* Instruction input */}
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          placeholder="e.g., make this more tense"
          className="h-8 text-xs"
          autoFocus
          disabled={isLoading}
        />
        <Button
          size="sm"
          className="h-8 shrink-0"
          onClick={handleGenerate}
          disabled={!instruction.trim() || isLoading}
        >
          {isLoading ? <Loader2Icon className="size-3 animate-spin" /> : <SparklesIcon className="size-3" />}
        </Button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-2">
          <div className="rounded bg-green-500/5 border border-green-500/20 p-2 text-xs font-serif">
            {result}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 text-xs flex-1" onClick={() => onAccept(result)}>
              Accept
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setResult(null); inputRef.current?.focus(); }}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* Quick suggestions */}
      {!result && !isLoading && (
        <div className="flex flex-wrap gap-1">
          {["make tenser", "add detail", "simplify", "slow pacing", "more emotion"].map((s) => (
            <button
              key={s}
              onClick={() => { setInstruction(s); }}
              className="text-[9px] rounded-full border px-2 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
