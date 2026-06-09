"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ZapIcon,
  PlayIcon,
  PauseIcon,
  SquareIcon,
  TrophyIcon,
  FlameIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/**
 * Writing Sprints: Timed focused writing sessions with word count tracking.
 * 
 * Features:
 * - Configurable sprint duration (5, 10, 15, 20, 25, 30 min)
 * - Live word count delta during sprint
 * - Personal best tracking (localStorage)
 * - Celebration on completion
 */

interface WritingSprintsProps {
  bookId: string;
  /** Current total word count from the editor (to track delta) */
  currentWordCount?: number;
}

const SPRINT_DURATIONS = [5, 10, 15, 20, 25, 30];

interface SprintResult {
  duration: number;
  wordsWritten: number;
  wordsPerMinute: number;
  date: string;
}

function getPersonalBest(): SprintResult | null {
  try {
    const stored = localStorage.getItem("wmb-sprint-best");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function savePersonalBest(result: SprintResult) {
  try {
    localStorage.setItem("wmb-sprint-best", JSON.stringify(result));
  } catch {}
}

export function WritingSprints({ bookId, currentWordCount = 0 }: WritingSprintsProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [duration, setDuration] = useState(15);
  const [elapsed, setElapsed] = useState(0);
  const [startWords, setStartWords] = useState(0);
  const [personalBest, setPersonalBest] = useState<SprintResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wordsWritten = Math.max(0, currentWordCount - startWords);
  const remaining = Math.max(0, duration * 60 - elapsed);
  const progress = duration > 0 ? Math.min(100, (elapsed / (duration * 60)) * 100) : 0;
  const wpm = elapsed > 30 ? Math.round(wordsWritten / (elapsed / 60)) : 0;

  useEffect(() => {
    setPersonalBest(getPersonalBest());
  }, []);

  const start = useCallback(() => {
    setPhase("running");
    setElapsed(0);
    setStartWords(currentWordCount);
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
  }, [currentWordCount]);

  const pause = useCallback(() => {
    setPhase("paused");
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const resume = useCallback(() => {
    setPhase("running");
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    setPhase("done");
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  // Auto-complete when time runs out
  useEffect(() => {
    if (phase === "running" && elapsed >= duration * 60) {
      stop();
      const result: SprintResult = {
        duration,
        wordsWritten,
        wordsPerMinute: Math.round(wordsWritten / duration),
        date: new Date().toISOString(),
      };
      if (!personalBest || result.wordsPerMinute > personalBest.wordsPerMinute) {
        savePersonalBest(result);
        setPersonalBest(result);
        toast.success("\u{1F3C6} New personal best! " + result.wordsPerMinute + " words/min!");
      } else {
        toast.success("\u{2705} Sprint complete! " + wordsWritten + " words in " + duration + " minutes");
      }
    }
  }, [elapsed, phase, duration, wordsWritten, personalBest, stop]);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const reset = () => {
    setPhase("idle");
    setElapsed(0);
    setStartWords(0);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ZapIcon className="size-4 text-amber-500" />
            Writing Sprint
          </CardTitle>
          {personalBest && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <TrophyIcon className="size-2.5" />
              Best: {personalBest.wordsPerMinute} wpm
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {phase === "idle" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Set a timer and write as much as you can. No editing — just write!
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SPRINT_DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    duration === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>
            <Button onClick={start} className="w-full" size="sm">
              <PlayIcon className="size-3.5 mr-1.5" />
              Start {duration}-minute sprint
            </Button>
          </div>
        )}

        {(phase === "running" || phase === "paused") && (
          <div className="space-y-3">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-mono tabular-nums text-lg font-bold">
                  {formatTime(remaining)}
                </span>
                <span className="text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Live stats */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold tabular-nums">{wordsWritten}</div>
                <div className="text-[10px] text-muted-foreground">words written</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-lg font-bold tabular-nums flex items-center justify-center gap-1">
                  {wpm}
                  {wpm > 0 && <FlameIcon className="size-3.5 text-orange-500" />}
                </div>
                <div className="text-[10px] text-muted-foreground">words/min</div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              {phase === "running" ? (
                <Button variant="outline" size="sm" className="flex-1" onClick={pause}>
                  <PauseIcon className="size-3.5 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="flex-1" onClick={resume}>
                  <PlayIcon className="size-3.5 mr-1" />
                  Resume
                </Button>
              )}
              <Button variant="destructive" size="sm" className="flex-1" onClick={stop}>
                <SquareIcon className="size-3.5 mr-1" />
                End Sprint
              </Button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-3 text-center">
            <div className="text-4xl">🎉</div>
            <div>
              <p className="text-sm font-medium">Sprint Complete!</p>
              <p className="text-xs text-muted-foreground">
                {wordsWritten} words in {formatTime(elapsed)} ({wpm} wpm)
              </p>
            </div>
            {personalBest && wpm >= personalBest.wordsPerMinute && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                <TrophyIcon className="size-3 mr-1" />
                New Personal Best!
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={reset} className="w-full">
              Start Another Sprint
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
