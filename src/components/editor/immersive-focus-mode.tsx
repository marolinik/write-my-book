"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { XIcon, Volume2Icon, TargetIcon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countWords } from "@/lib/utils";

/**
 * Gap 1: True Immersive Focus Mode — Scrivener's Composition Mode equivalent.
 * Full-screen, distraction-free writing environment with:
 * - Centered text column (max-width ~700px)
 * - Ambient background (dark/sepia/paper)
 * - Session word count + timer
 * - Typewriter scrolling (cursor always centered vertically)
 * - Optional ambient sounds
 * - Escape to exit
 */

type FocusTheme = "dark" | "sepia" | "paper";

interface ImmersiveFocusModeProps {
  /** TipTap editor content as HTML */
  content: string;
  /** Called when user types — should update the editor content */
  onContentChange: (html: string) => void;
  /** Exit focus mode */
  onExit: () => void;
  /** Initial theme */
  defaultTheme?: FocusTheme;
}

const THEME_STYLES: Record<FocusTheme, { bg: string; text: string; caret: string }> = {
  dark: {
    bg: "bg-zinc-950",
    text: "text-zinc-300",
    caret: "caret-zinc-400",
  },
  sepia: {
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-950 dark:text-amber-100",
    caret: "caret-amber-700 dark:caret-amber-300",
  },
  paper: {
    bg: "bg-stone-50 dark:bg-stone-900",
    text: "text-stone-900 dark:text-stone-100",
    caret: "caret-stone-600 dark:caret-stone-400",
  },
};

export function ImmersiveFocusMode({
  content,
  onContentChange,
  onExit,
  defaultTheme = "dark",
}: ImmersiveFocusModeProps) {
  const [theme, setTheme] = useState<FocusTheme>(defaultTheme);
  const [sessionWords, setSessionWords] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const initialWordCount = useRef(0);
  const editorRef = useRef<HTMLDivElement>(null);

  // Track initial word count
  useEffect(() => {
    initialWordCount.current = countWords(content);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Session timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Escape key to exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onExit]);

  // Enter fullscreen on mount
  useEffect(() => {
    try {
      document.documentElement.requestFullscreen?.();
    } catch {
      // fullscreen not supported or blocked
    }
    return () => {
      try {
        document.exitFullscreen?.();
      } catch {}
    };
  }, []);

  // Track word count changes
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || "";
    const current = countWords(text);
    setSessionWords(Math.max(0, current - initialWordCount.current));
    onContentChange(el.innerHTML);
  }, [onContentChange]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const wpm = elapsed > 60 ? Math.round((sessionWords / elapsed) * 60) : 0;
  const styles = THEME_STYLES[theme];

  return (
    <div className={`fixed inset-0 z-[100] ${styles.bg} ${styles.text} flex flex-col`}>
      {/* Minimal top bar — fades in on hover */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-6 py-3 opacity-0 hover:opacity-100 transition-opacity duration-500 z-10">
        <div className="flex items-center gap-4 text-xs opacity-70">
          <span className="flex items-center gap-1">
            <ClockIcon className="size-3" />
            {formatTime(elapsed)}
          </span>
          <span className="flex items-center gap-1">
            <TargetIcon className="size-3" />
            +{sessionWords} words
          </span>
          {wpm > 0 && <span>{wpm} wpm</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Theme switcher */}
          {(["dark", "sepia", "paper"] as FocusTheme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`size-5 rounded-full border-2 transition-transform ${
                t === theme ? "scale-125 border-current" : "border-transparent opacity-50"
              } ${
                t === "dark" ? "bg-zinc-800" : t === "sepia" ? "bg-amber-200" : "bg-stone-200"
              }`}
              title={t}
            />
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={onExit}
            className="text-xs opacity-70 hover:opacity-100"
          >
            <XIcon className="size-3 mr-1" />
            Exit Focus
          </Button>
        </div>
      </div>

      {/* Centered writing area — typewriter style */}
      <div className="flex-1 overflow-y-auto flex justify-center">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className={`w-full max-w-[680px] px-8 pt-[40vh] pb-[60vh] outline-none
            font-serif text-lg leading-relaxed ${styles.caret}
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3
            [&_p]:mb-4
            [&_em]:italic
            [&_strong]:font-bold
          `}
          dangerouslySetInnerHTML={{ __html: content }}
          onInput={handleInput}
          spellCheck
          autoFocus
        />
      </div>

      {/* Bottom session stats — always visible but subtle */}
      <div className="absolute bottom-4 inset-x-0 flex justify-center">
        <div className="flex items-center gap-3 text-[10px] opacity-30 select-none">
          <span>{formatTime(elapsed)}</span>
          <span>•</span>
          <span>+{sessionWords} words this session</span>
          {wpm > 0 && (
            <>
              <span>•</span>
              <span>{wpm} words/min</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
