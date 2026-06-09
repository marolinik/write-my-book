"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  PlayIcon,
  PauseIcon,
  SquareIcon,
  TrophyIcon,
  FlameIcon,
  TimerIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Gap 3: Word Sprint Timer
 * NaNoWriMo-style timed writing sessions with:
 * - Preset durations (5/10/15/20/30/60 min)
 * - Live word count delta tracking
 * - WPM calculation
 * - Session results with personal best tracking
 */

interface WordSprintProps {
  /** Current word count from the editor */
  currentWordCount: number;
  /** Book ID for persisting sprint history */
  bookId: string;
}

type SprintState = "idle" | "countdown" | "running" | "paused" | "complete";

const DURATIONS = [
  { value: "5", label: "5 min" },
  { value: "10", label: "10 min" },
  { value: "15", label: "15 min" },
  { value: "20", label: "20 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
];

export function WordSprint({ currentWordCount, bookId }: WordSprintProps) {
  const [state, setState] = useState<SprintState>("idle");
  const [duration, setDuration] = useState("15");
  const [timeLeft, setTimeLeft] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [startWordCount, setStartWordCount] = useState(0);
  const [wordsWritten, setWordsWritten] = useState(0);
  const [personalBest, setPersonalBest] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load personal best
  useEffect(() => {
    try {
      const pb = localStorage.getItem(`wmb-sprint-pb-${bookId}`);
      if (pb) setPersonalBest(parseInt(pb, 10));
    } catch {}
  }, [bookId]);

  // Track words written during sprint
  useEffect(() => {
    if (state === "running") {
      setWordsWritten(Math.max(0, currentWordCount - startWordCount));
    }
  }, [currentWordCount, startWordCount, state]);

  const startSprint = useCallback(() => {
    setState("countdown");
    setCountdown(3);
    
    const cdInterval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(cdInterval);
          // Start the actual sprint
          setState("running");
          setStartWordCount(currentWordCount);
          setWordsWritten(0);
          setTimeLeft(parseInt(duration, 10) * 60);

          // Start timer
          const timer = setInterval(() => {
            setTimeLeft((t) => {
              if (t <= 1) {
                clearInterval(timer);
                setState("complete");
                return 0;
              }
              return t - 1;
            });
          }, 1000);
          intervalRef.current = timer;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [currentWordCount, duration]);

  const pauseSprint = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setState("paused");
  }, []);

  const resumeSprint = useCallback(() => {
    setState("running");
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          setState("complete");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    intervalRef.current = timer;
  }, []);

  const stopSprint = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setState("complete");
  }, []);

  const resetSprint = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setState("idle");
    setWordsWritten(0);
    setTimeLeft(0);
  }, []);

  // Save personal best on complete
  useEffect(() => {
    if (state === "complete" && wordsWritten > personalBest) {
      setPersonalBest(wordsWritten);
      try {
        localStorage.setItem(`wmb-sprint-pb-${bookId}`, wordsWritten.toString());
      } catch {}
    }
  }, [state, wordsWritten, personalBest, bookId]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const totalSeconds = parseInt(duration, 10) * 60;
  const elapsedSeconds = totalSeconds - timeLeft;
  const wpm = elapsedSeconds > 0 ? Math.round((wordsWritten / elapsedSeconds) * 60) : 0;
  const progress = totalSeconds > 0 ? ((totalSeconds - timeLeft) / totalSeconds) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TimerIcon className="size-4" />
          Word Sprint
          {personalBest > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px] gap-1">
              <TrophyIcon className="size-3" />
              PB: {personalBest}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state === "idle" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={startSprint} className="flex-1">
                <PlayIcon className="size-3 mr-1" />
                Start Sprint
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Write as many words as you can in {duration} minutes!
            </p>
          </div>
        )}

        {state === "countdown" && (
          <div className="flex flex-col items-center py-4">
            <div className="text-5xl font-bold animate-pulse">{countdown}</div>
            <p className="text-sm text-muted-foreground mt-2">Get ready to write...</p>
          </div>
        )}

        {(state === "running" || state === "paused") && (
          <div className="space-y-3">
            {/* Timer */}
            <div className="text-center">
              <div className="text-3xl font-mono font-bold tabular-nums">
                {formatTime(timeLeft)}
              </div>
              <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-bold">{wordsWritten}</div>
                <div className="text-[10px] text-muted-foreground">words</div>
              </div>
              <div>
                <div className="text-lg font-bold">{wpm}</div>
                <div className="text-[10px] text-muted-foreground">wpm</div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              {state === "running" ? (
                <Button variant="outline" size="sm" onClick={pauseSprint} className="flex-1">
                  <PauseIcon className="size-3 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button size="sm" onClick={resumeSprint} className="flex-1">
                  <PlayIcon className="size-3 mr-1" />
                  Resume
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={stopSprint}>
                <SquareIcon className="size-3 mr-1" />
                End
              </Button>
            </div>
          </div>
        )}

        {state === "complete" && (
          <div className="space-y-3 text-center">
            <div className="text-3xl">🎉</div>
            <div>
              <div className="text-2xl font-bold">{wordsWritten} words</div>
              <div className="text-sm text-muted-foreground">
                in {parseInt(duration, 10)} min ({wpm} wpm)
              </div>
            </div>
            {wordsWritten >= personalBest && wordsWritten > 0 && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-300">
                <TrophyIcon className="size-3 mr-1" />
                New Personal Best!
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={resetSprint} className="w-full">
              <FlameIcon className="size-3 mr-1" />
              Sprint Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
