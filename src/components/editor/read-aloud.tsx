"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Volume2Icon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  SkipForwardIcon,
  Settings2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Gap 7: Read-Aloud / Text-to-Speech
 * Uses the Web Speech API (SpeechSynthesis) to read manuscript text aloud.
 * Features:
 * - Play/pause/stop controls
 * - Voice selection (system voices)
 * - Speed control (0.5x to 2x)
 * - Highlights current sentence in editor while reading
 * - Reads selected text or full chapter
 */

interface ReadAloudProps {
  /** Text to read (plain text, not HTML) */
  text: string;
  /** Called with the current reading position (sentence index) */
  onHighlight?: (sentenceIndex: number) => void;
  /** Called when reading completes */
  onComplete?: () => void;
  /**
   * Extra classes for the root container. The toolbar passes `hidden` at
   * compact density so the component stays mounted (playback continues)
   * while the controls disappear from the row.
   */
  className?: string;
}

export function ReadAloud({
  text,
  onHighlight,
  onComplete,
  className,
}: ReadAloudProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState(1.0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const available = speechSynthesis.getVoices();
      setVoices(available);
      // Default to first English voice
      const english = available.find((v) => v.lang.startsWith("en"));
      if (english && !selectedVoice) {
        setSelectedVoice(english.name);
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Split text into sentences
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);

  const speakSentence = useCallback(
    (index: number) => {
      if (index >= sentences.length) {
        setIsPlaying(false);
        setCurrentSentence(0);
        onComplete?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentences[index]);
      utterance.rate = rate;

      const voice = voices.find((v) => v.name === selectedVoice);
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setCurrentSentence(index);
        onHighlight?.(index);
      };

      utterance.onend = () => {
        speakSentence(index + 1);
      };

      utterance.onerror = () => {
        setIsPlaying(false);
      };

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    },
    [sentences, rate, voices, selectedVoice, onHighlight, onComplete]
  );

  const handlePlay = useCallback(() => {
    if (isPaused) {
      speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    speechSynthesis.cancel();
    setIsPlaying(true);
    setIsPaused(false);
    speakSentence(currentSentence);
  }, [isPaused, currentSentence, speakSentence]);

  const handlePause = useCallback(() => {
    speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentence(0);
  }, []);

  const handleSkip = useCallback(() => {
    speechSynthesis.cancel();
    const next = Math.min(currentSentence + 1, sentences.length - 1);
    setCurrentSentence(next);
    if (isPlaying) {
      speakSentence(next);
    }
  }, [currentSentence, sentences.length, isPlaying, speakSentence]);

  const progress = sentences.length > 0
    ? Math.round(((currentSentence + 1) / sentences.length) * 100)
    : 0;

  // Filter to usable voices (not too many — group by language)
  const usableVoices = voices.filter(
    (v) => v.lang.startsWith("en") || v.lang.startsWith("sr") || v.lang.startsWith("de") || v.lang.startsWith("es") || v.lang.startsWith("fr")
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Play/Pause button */}
      {isPlaying ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handlePause}
          title="Pause"
          aria-label="Pause"
        >
          <PauseIcon className="size-3.5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handlePlay}
          title="Read aloud"
          aria-label="Read aloud"
        >
          {isPaused ? (
            <PlayIcon className="size-3.5" />
          ) : (
            <Volume2Icon className="size-3.5" />
          )}
        </Button>
      )}

      {/* Stop */}
      {(isPlaying || isPaused) && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleStop}
            title="Stop"
            aria-label="Stop"
          >
            <SquareIcon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleSkip}
            title="Next sentence"
            aria-label="Next sentence"
          >
            <SkipForwardIcon className="size-3.5" />
          </Button>
          <span className="text-[10px] text-muted-foreground tabular-nums ml-1">
            {progress}%
          </span>
        </>
      )}

      {/* Settings popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Read aloud settings"
          >
            <Settings2Icon className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-3" side="bottom" align="end">
          <div className="space-y-1">
            <Label className="text-xs">Voice</Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {usableVoices.map((v) => (
                  <SelectItem key={v.name} value={v.name} className="text-xs">
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Speed: {rate}x</Label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full h-1 accent-primary"
              aria-label="Reading speed"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
