"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Volume2Icon,
  VolumeXIcon,
  CloudRainIcon,
  CoffeeIcon,
  BookOpenIcon,
  FlameIcon,
  WindIcon,
  TreePineIcon,
  WavesIcon,
  Loader2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * PILLAR 3L: Built-in Ambient Soundscapes
 * 
 * Uses the Web Audio API with white noise + filters to generate
 * ambient sounds client-side (no audio files needed).
 * 
 * Soundscapes available:
 * - Rain (brown noise + gentle modulation)
 * - Coffee Shop (brown noise + subtle variation)
 * - Library (very quiet, almost silent with occasional subtle sounds)
 * - Fireplace (warm brown noise with crackling rhythm)
 * - Forest (green noise + bird-like modulation)
 * - Ocean (low brown noise with rhythmic volume swells)
 */

type SoundscapeType = "rain" | "coffee" | "library" | "fire" | "forest" | "ocean" | "off";

interface SoundscapeConfig {
  label: string;
  icon: React.ElementType;
  /** Brown noise filter frequency (Hz) — lower = deeper */
  frequency: number;
  /** Volume (0-1) */
  volume: number;
  /** Modulation depth — how much the volume oscillates */
  modDepth: number;
  /** Modulation rate — how fast the volume oscillates (Hz) */
  modRate: number;
}

const SOUNDSCAPES: Record<Exclude<SoundscapeType, "off">, SoundscapeConfig> = {
  rain: {
    label: "Rain",
    icon: CloudRainIcon,
    frequency: 400,
    volume: 0.3,
    modDepth: 0.15,
    modRate: 0.1,
  },
  coffee: {
    label: "Coffee Shop",
    icon: CoffeeIcon,
    frequency: 600,
    volume: 0.15,
    modDepth: 0.08,
    modRate: 0.3,
  },
  library: {
    label: "Library",
    icon: BookOpenIcon,
    frequency: 200,
    volume: 0.05,
    modDepth: 0.02,
    modRate: 0.05,
  },
  fire: {
    label: "Fireplace",
    icon: FlameIcon,
    frequency: 350,
    volume: 0.2,
    modDepth: 0.25,
    modRate: 0.8,
  },
  forest: {
    label: "Forest",
    icon: TreePineIcon,
    frequency: 800,
    volume: 0.12,
    modDepth: 0.1,
    modRate: 0.2,
  },
  ocean: {
    label: "Ocean",
    icon: WavesIcon,
    frequency: 250,
    volume: 0.25,
    modDepth: 0.3,
    modRate: 0.06,
  },
};

export function AmbientSoundscape() {
  const [active, setActive] = useState<SoundscapeType>("off");
  const [volume, setVolume] = useState(0.5);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{
    noise: AudioBufferSourceNode | null;
    gain: GainNode | null;
    filter: BiquadFilterNode | null;
    lfo: OscillatorNode | null;
    lfoGain: GainNode | null;
  }>({
    noise: null,
    gain: null,
    filter: null,
    lfo: null,
    lfoGain: null,
  });

  const stopSound = useCallback(() => {
    const nodes = nodesRef.current;
    try { nodes.noise?.stop(); } catch {}
    try { nodes.lfo?.stop(); } catch {}
    nodes.noise = null;
    nodes.gain = null;
    nodes.filter = null;
    nodes.lfo = null;
    nodes.lfoGain = null;
  }, []);

  const playSound = useCallback((type: Exclude<SoundscapeType, "off">) => {
    stopSound();

    const config = SOUNDSCAPES[type];
    if (!config) return;

    // Create/resume audio context
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    // Generate brown noise buffer (2 seconds, looped)
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Brown noise: integrate white noise with leak
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5; // Amplify
    }

    // Create nodes
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = config.frequency;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = config.volume * volume;

    // LFO for natural volume modulation
    const lfo = ctx.createOscillator();
    lfo.frequency.value = config.modRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = config.modDepth * volume;

    // Connect: source → filter → gain → output
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // LFO modulates the gain
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    source.start();
    lfo.start();

    nodesRef.current = { noise: source, gain, filter, lfo, lfoGain };
  }, [volume, stopSound]);

  // Start/stop based on active state
  useEffect(() => {
    if (active === "off") {
      stopSound();
    } else {
      playSound(active);
    }
    return () => stopSound();
  }, [active, playSound, stopSound]);

  // Update volume in real-time
  useEffect(() => {
    const { gain, lfoGain } = nodesRef.current;
    if (gain && active !== "off") {
      const config = SOUNDSCAPES[active];
      gain.gain.value = config.volume * volume;
      if (lfoGain) lfoGain.gain.value = config.modDepth * volume;
    }
  }, [volume, active]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSound();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [stopSound]);

  const toggle = (type: SoundscapeType) => {
    setActive((prev) => (prev === type ? "off" : type));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={active !== "off" ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          title="Ambient sounds"
        >
          {active !== "off" ? (
            <Volume2Icon className="size-3.5" />
          ) : (
            <VolumeXIcon className="size-3.5 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-3" side="bottom" align="end">
        <div className="text-xs font-medium">Ambient Sounds</div>

        {/* Soundscape buttons */}
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.entries(SOUNDSCAPES) as Array<[Exclude<SoundscapeType, "off">, SoundscapeConfig]>).map(
            ([key, config]) => {
              const Icon = config.icon;
              const isActive = active === key;
              return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  className={`flex flex-col items-center gap-1 rounded-md p-2 text-[10px] transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{config.label}</span>
                </button>
              );
            }
          )}
        </div>

        {/* Volume slider */}
        {active !== "off" && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Volume</span>
              <span>{Math.round(volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1 accent-primary"
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
