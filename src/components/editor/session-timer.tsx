"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ClockIcon, PlayIcon, PauseIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * O: Session Timer with Gentle Accountability.
 * "You planned to write for 45 minutes. 12 minutes left."
 * Not punitive — just informational. Shows in the status bar.
 */

interface SessionTimerProps {
  /** Called when session starts (for tracking) */
  onSessionStart?: (durationMinutes: number) => void;
  /** Called when session ends naturally or is stopped */
  onSessionEnd?: (elapsedMinutes: number, wordsWritten: number) => void;
  /** Current word count from editor (for delta tracking) */
  currentWordCount?: number;
}

const PRESET_DURATIONS = [15, 25, 30, 45, 60, 90];

export function SessionTimer({ onSessionStart, onSessionEnd, currentWordCount }: SessionTimerProps) {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [targetMinutes, setTargetMinutes] = useState(30);
  const [elapsed, setElapsed] = useState(0); // seconds
  const [showPicker, setShowPicker] = useState(false);
  const startWordCount = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const remaining = Math.max(0, targetMinutes * 60 - elapsed);
  const progressPct = targetMinutes > 0 ? Math.min(100, (elapsed / (targetMinutes * 60)) * 100) : 0;
  const isOvertime = elapsed > targetMinutes * 60;

  const start = useCallback(() => {
    setIsActive(true);
    setIsPaused(false);
    setElapsed(0);
    startWordCount.current = currentWordCount ?? 0;
    setShowPicker(false);
    onSessionStart?.(targetMinutes);

    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
  }, [targetMinutes, currentWordCount, onSessionStart]);

  const pause = useCallback(() => {
    setIsPaused(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    setIsPaused(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    const wordsWritten = Math.max(0, (currentWordCount ?? 0) - startWordCount.current);
    onSessionEnd?.(Math.round(elapsed / 60), wordsWritten);
  }, [elapsed, currentWordCount, onSessionEnd]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!isActive) {
    if (showPicker) {
      return (
        <div className="flex items-center gap-1.5">
          {PRESET_DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => { setTargetMinutes(d); start(); }}
              className="text-[10px] rounded border px-1.5 py-0.5 hover:bg-muted transition-colors"
            >
              {d}m
            </button>
          ))}
          <button
            onClick={() => setShowPicker(false)}
            className="text-muted-foreground"
            aria-label="Close timer"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      );
    }

    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] gap-1"
        onClick={() => setShowPicker(true)}
      >
        <ClockIcon className="size-3" />
        Timer
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative size-5">
        <svg className="size-5 -rotate-90" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30" />
          <circle
            cx="10" cy="10" r="8" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeDasharray={`${progressPct * 0.5} ${50 - progressPct * 0.5}`}
            className={isOvertime ? "text-amber-500" : "text-primary"}
          />
        </svg>
      </div>

      <span className={`text-[10px] font-mono tabular-nums ${isOvertime ? "text-amber-500" : ""}`}>
        {isOvertime ? `+${formatTime(elapsed - targetMinutes * 60)}` : formatTime(remaining)}
      </span>

      {isPaused ? (
        <button
          onClick={resume}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Resume session timer"
        >
          <PlayIcon className="size-3" />
        </button>
      ) : (
        <button
          onClick={pause}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Pause session timer"
        >
          <PauseIcon className="size-3" />
        </button>
      )}

      <button
        onClick={stop}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Stop session timer"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
