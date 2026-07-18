"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { XIcon, TargetIcon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countWords } from "@/lib/utils";
import { EDITOR_MEASURE_CLASS } from "./editor-utils";
import { announce } from "./live-announcer";
import {
  sanitizeImmersiveHtml,
  registerImmersiveFlushGuards,
} from "./immersive-safety";

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

/** Screen-reader announcements for entering/leaving the overlay (spec §2). */
const ENTER_ANNOUNCEMENT = "Entered immersive mode, press Escape to exit";
const EXIT_ANNOUNCEMENT = "Exited immersive mode";

/** Elements the minimal Tab-cycling focus trap considers focusable. */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [contenteditable="true"], [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ImmersiveFocusModeProps {
  /** TipTap editor content as HTML — the enter-time snapshot (mount seed). */
  content: string;
  /**
   * Parent-owned buffer holding the freshest immersive HTML (the parent
   * updates it on every onContentChange). Mount seeds from this when present
   * so an intermittent remount of the overlay re-applies the LIVE words, not
   * the stale enter-time snapshot (D-23). Read only inside effects.
   */
  liveContentRef?: { readonly current: string };
  /** Called when user types — should update the editor content */
  onContentChange: (html: string) => void;
  /** Exit focus mode */
  onExit: () => void;
  /**
   * Persist pending immersive edits through the real save path. Invoked on the
   * unload guards (pagehide / visibilitychange:hidden) so a tab close or hide
   * routes the latest keystrokes into autosave before the loss window opens.
   */
  onFlush?: () => void;
  /** Initial theme */
  defaultTheme?: FocusTheme;
}

/**
 * Place the caret at the end of a contentEditable element. Used after the
 * mount-time content application so typing continues where the prose ends —
 * never prepended at position 0 (the D-23 corruption signature).
 */
function moveCaretToEnd(el: HTMLElement): void {
  try {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Selection API unavailable (some embedded/AT environments) — focus
    // without caret placement is an acceptable degradation.
  }
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
  liveContentRef,
  onContentChange,
  onExit,
  onFlush,
  defaultTheme = "dark",
}: ImmersiveFocusModeProps) {
  const [theme, setTheme] = useState<FocusTheme>(defaultTheme);
  const [sessionWords, setSessionWords] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const initialWordCount = useRef(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // D-23 invariant: the contentEditable's HTML is applied imperatively
  // EXACTLY ONCE per mount and never re-rendered from React state — React
  // renders the element childless, so no later re-render (parent snapshot
  // churn, theme switch, session-timer tick) can rewrite the live DOM and
  // wipe typed words. The seed prefers the parent's live buffer over the
  // enter-time snapshot so even a mid-session remount re-applies the
  // freshest keystrokes. Sanitization stays on every application (S10).
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // ?? not ||: an empty buffer is a legitimate state (writer deleted
    // everything) — falling back to the enter snapshot would resurrect it.
    const seed = liveContentRef?.current ?? content;
    el.innerHTML = sanitizeImmersiveHtml(seed);
    initialWordCount.current = countWords(el.innerText || "");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Announce entry/exit to screen readers, MOVE FOCUS INTO the modal on
  // open (an aria-modal dialog that leaves focus behind it strands keyboard
  // users and makes the Tab trap inoperative — WCAG 2.4.3), and return focus
  // to the underlying TipTap editor when the overlay closes. The restore is
  // deferred a frame so it lands after exitImmersive's content sync.
  useEffect(() => {
    const underlyingEditable =
      document.querySelector<HTMLElement>(".ProseMirror");
    announce(ENTER_ANNOUNCEMENT);
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      // Caret at the end of the prose — a bare focus() lands at position 0,
      // which is exactly where D-23's surviving keystrokes were prepended.
      moveCaretToEnd(el);
    });
    return () => {
      announce(EXIT_ANNOUNCEMENT);
      if (underlyingEditable) {
        requestAnimationFrame(() => {
          if (underlyingEditable.isConnected) {
            underlyingEditable.focus();
          }
        });
      }
    };
  }, []);

  // Minimal focus trap: cycle Tab/Shift+Tab within the overlay. Full inert
  // treatment is overkill — the overlay is z-[100] fullscreen (spec §2).
  const handleTrapKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    []
  );

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

  // Loss-window guard (S10): while immersive, edits live only in the parent's
  // ref until its 30s periodic sync. Mirror use-draft-buffer's unload flush so
  // a tab close / hide first pushes the freshest innerHTML into the ref and
  // then routes it into the real save path via onFlush. Because
  // visibilitychange:hidden precedes pagehide on close, the parent draft
  // buffer's own pagehide flush then reads the now-fresh editor content.
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = () => {
      const el = editorRef.current;
      if (el) onContentChange(el.innerHTML);
      onFlush?.();
    };
  });
  useEffect(
    () => registerImmersiveFlushGuards(() => flushRef.current()),
    []
  );

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const wpm = elapsed > 60 ? Math.round((sessionWords / elapsed) * 60) : 0;
  const styles = THEME_STYLES[theme];

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Immersive focus mode"
      aria-describedby="immersive-mode-instructions"
      onKeyDown={handleTrapKeyDown}
      className={`fixed inset-0 z-[100] ${styles.bg} ${styles.text} flex flex-col`}
    >
      {/* Instructions live INSIDE the aria-modal dialog — the global live
          region outside it is unreliable while the modal holds AT focus */}
      <span id="immersive-mode-instructions" className="sr-only">
        Distraction-free writing. Press Escape to exit.
      </span>
      {/* Minimal top bar — fades in on hover or keyboard focus */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-6 py-3 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-500 z-10">
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
              type="button"
              onClick={() => setTheme(t)}
              className={`size-5 rounded-full border-2 transition-transform ${
                t === theme ? "scale-125 border-current" : "border-transparent opacity-50"
              } ${
                t === "dark" ? "bg-zinc-800" : t === "sepia" ? "bg-amber-200" : "bg-stone-200"
              }`}
              title={t}
              aria-label={`${t} theme`}
              aria-pressed={theme === t}
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
        {/* Deliberately childless: content is applied once per mount via the
            layout effect above, so React reconciliation can never rewrite the
            live typing surface (D-23). */}
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Distraction-free editor"
          className={`w-full ${EDITOR_MEASURE_CLASS} px-5 sm:px-8 pt-[35dvh] pb-[55dvh] outline-none
            font-serif text-lg leading-relaxed ${styles.caret}
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3
            [&_p]:mb-4
            [&_em]:italic
            [&_strong]:font-bold
          `}
          onInput={handleInput}
          spellCheck
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
