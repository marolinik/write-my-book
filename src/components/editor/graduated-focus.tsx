"use client";

import { useState } from "react";
import { FocusIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * K: Graduated Focus Modes (4 levels).
 * Level 0: Normal (everything visible)
 * Level 1: Dim sidebar + header (writing area emphasized)
 * Level 2: Current paragraph only (everything else dimmed)
 * Level 3: Current sentence only (maximum focus)
 * Level 4: Full lockout (immersive mode — handled by ImmersiveFocusMode)
 * 
 * Applies CSS classes to the editor and surrounding elements.
 */

export type FocusLevel = 0 | 1 | 2 | 3;

interface GraduatedFocusProps {
  currentLevel?: FocusLevel;
  onChange?: (level: FocusLevel) => void;
  onEnterImmersive?: () => void;
}

// Level 3 (sentence) is hidden this phase: there is no sentence-decoration
// producer, so it would render identically to level 2 (paragraph).
const FOCUS_LEVELS = [
  { level: 0 as FocusLevel, label: "Normal", desc: "Everything visible", icon: "👁️" },
  { level: 1 as FocusLevel, label: "Focused", desc: "Sidebar & header dimmed", icon: "🔍" },
  { level: 2 as FocusLevel, label: "Paragraph", desc: "Current paragraph highlighted", icon: "📝" },
];

export function GraduatedFocus({ currentLevel: externalLevel, onChange: externalOnChange, onEnterImmersive }: GraduatedFocusProps) {
  const [internalLevel, setInternalLevel] = useState<FocusLevel>(0);
  const currentLevel = externalLevel ?? internalLevel;
  const onChange = externalOnChange ?? setInternalLevel;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={currentLevel > 0 ? "secondary" : "ghost"}
          size="icon"
          className="size-7"
          title="Focus mode"
        >
          {currentLevel > 0 ? (
            <EyeOffIcon className="size-3.5" />
          ) : (
            <FocusIcon className="size-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 space-y-1" side="bottom">
        <p className="text-xs font-medium px-2 py-1">Focus Level</p>
        {FOCUS_LEVELS.map((fl) => (
          <button
            key={fl.level}
            onClick={() => onChange(fl.level)}
            className={`flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left transition-colors ${
              currentLevel === fl.level
                ? "bg-primary/10 text-primary"
                : "hover:bg-muted text-foreground"
            }`}
          >
            <span className="text-sm">{fl.icon}</span>
            <div>
              <p className="text-xs font-medium">{fl.label}</p>
              <p className="text-[9px] text-muted-foreground">{fl.desc}</p>
            </div>
          </button>
        ))}
        {onEnterImmersive && (
          <>
            <div className="h-px bg-border my-1" />
            <button
              onClick={onEnterImmersive}
              className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <span className="text-sm">🌙</span>
              <div>
                <p className="text-xs font-medium">Immersive</p>
                <p className="text-[9px] text-muted-foreground">Full-screen zen mode</p>
              </div>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * CSS classes to apply at each focus level.
 * Apply these to the editor wrapper element.
 */
export function getFocusLevelClasses(level: FocusLevel): string {
  switch (level) {
    case 0: return "";
    case 1: return "wmb-focus-1"; // Sidebar + header opacity-30
    case 2: return "wmb-focus-2"; // Paragraph-level: [data-focus-active] visible, rest opacity-20
    // Level 3 ships paragraph-equivalent: .is-current-sentence has no producer,
    // so wmb-focus-3 would dim the active paragraph to near-invisible.
    case 3: return "wmb-focus-2";
    default: return "";
  }
}

/**
 * Global CSS to add to globals.css for focus mode support:
 * 
 * .wmb-focus-1 ~ aside,
 * .wmb-focus-1 ~ header { opacity: 0.15; transition: opacity 0.5s; }
 * .wmb-focus-1 ~ aside:hover,
 * .wmb-focus-1 ~ header:hover { opacity: 1; }
 * 
 * .wmb-focus-2 .ProseMirror p { opacity: 0.15; transition: opacity 0.3s; }
 * .wmb-focus-2 .ProseMirror p:focus-within,
 * .wmb-focus-2 .ProseMirror p.is-active { opacity: 1; }
 * 
 * .wmb-focus-3 .ProseMirror p { opacity: 0.08; }
 * .wmb-focus-3 .ProseMirror p.is-active { opacity: 0.2; }
 * .wmb-focus-3 .ProseMirror .is-current-sentence { opacity: 1; }
 */
