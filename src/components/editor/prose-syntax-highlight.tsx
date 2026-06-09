"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HighlighterIcon,
  XIcon,
} from "lucide-react";

/**
 * PILLAR 3M: Syntax Highlighting for Prose (à la iA Writer)
 * Color-codes word types to reveal prose structure:
 * - Adjectives (purple) — too many = purple prose
 * - Adverbs (red) — often unnecessary
 * - Verbs (blue) — strong verbs = strong prose
 * - Nouns (green) — concrete nouns ground the reader
 * - Conjunctions (gray) — sentence connectors
 * 
 * Works by applying CSS classes to a contenteditable display copy.
 * Does NOT modify the actual editor content.
 */

type WordCategory = "adjective" | "adverb" | "verb" | "noun" | "conjunction" | "other";

// Simple heuristic word categorization (not perfect, but useful for visualization)
const ADVERB_SUFFIXES = ["ly", "ally", "ially", "ically"];
const COMMON_ADVERBS = new Set([
  "very", "really", "just", "already", "still", "even", "always", "never",
  "often", "sometimes", "soon", "here", "there", "now", "then", "quite",
  "almost", "perhaps", "also", "too", "only", "merely", "simply", "rather",
]);
const COMMON_CONJUNCTIONS = new Set([
  "and", "but", "or", "nor", "for", "yet", "so", "because", "although",
  "though", "while", "when", "if", "unless", "until", "since", "after",
  "before", "however", "therefore", "moreover", "furthermore", "nevertheless",
]);
const COMMON_ADJECTIVES = new Set([
  "big", "small", "old", "young", "new", "good", "bad", "great", "little",
  "long", "high", "low", "right", "wrong", "first", "last", "next", "few",
  "many", "much", "own", "other", "dark", "bright", "cold", "hot", "warm",
  "soft", "hard", "fast", "slow", "quiet", "loud", "deep", "wide", "thin",
  "thick", "empty", "full", "beautiful", "ugly", "happy", "sad", "angry",
]);
const LINKING_VERBS = new Set([
  "is", "am", "are", "was", "were", "be", "been", "being", "have", "has",
  "had", "do", "does", "did", "will", "would", "could", "should", "might",
  "can", "may", "shall", "must",
]);
const COMMON_VERBS = new Set([
  "said", "asked", "looked", "turned", "felt", "knew", "thought", "saw",
  "made", "came", "went", "took", "got", "gave", "told", "found", "wanted",
  "seemed", "let", "kept", "began", "started", "tried", "moved", "ran",
  "walked", "stood", "sat", "put", "left", "called", "heard", "opened",
  "closed", "pulled", "pushed", "held", "reached", "watched", "waited",
]);

function categorizeWord(word: string): WordCategory {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!lower) return "other";
  
  if (COMMON_CONJUNCTIONS.has(lower)) return "conjunction";
  if (COMMON_ADVERBS.has(lower)) return "adverb";
  if (ADVERB_SUFFIXES.some(s => lower.endsWith(s) && lower.length > s.length + 2)) return "adverb";
  if (COMMON_ADJECTIVES.has(lower)) return "adjective";
  if (lower.endsWith("ful") || lower.endsWith("ous") || lower.endsWith("ive") || lower.endsWith("ish")) return "adjective";
  if (LINKING_VERBS.has(lower) || COMMON_VERBS.has(lower)) return "verb";
  if (lower.endsWith("ed") || lower.endsWith("ing")) return "verb";
  
  return "other";
}

const CATEGORY_COLORS: Record<WordCategory, string> = {
  adjective: "text-purple-500 dark:text-purple-400",
  adverb: "text-red-500 dark:text-red-400",
  verb: "text-blue-500 dark:text-blue-400",
  noun: "text-green-500 dark:text-green-400",
  conjunction: "text-muted-foreground/50",
  other: "",
};

interface ProseSyntaxHighlightProps {
  /** Plain text content */
  text: string;
}

export function ProseSyntaxHighlight({ text }: ProseSyntaxHighlightProps) {
  const [active, setActive] = useState(false);

  const analysis = useMemo(() => {
    if (!active || !text) return null;

    const words = text.split(/\s+/);
    const counts: Record<WordCategory, number> = {
      adjective: 0, adverb: 0, verb: 0, noun: 0, conjunction: 0, other: 0,
    };

    const categorized = words.map((word) => {
      const cat = categorizeWord(word);
      counts[cat]++;
      return { word, category: cat };
    });

    const total = words.length;
    const adverbPct = total > 0 ? ((counts.adverb / total) * 100).toFixed(1) : "0";
    const adjPct = total > 0 ? ((counts.adjective / total) * 100).toFixed(1) : "0";

    return { categorized, counts, adverbPct, adjPct };
  }, [text, active]);

  if (!active) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={() => setActive(true)}
      >
        <HighlighterIcon className="size-3" />
        Syntax
      </Button>
    );
  }

  return (
    <div className="border rounded-md p-3 space-y-2 bg-background">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium flex items-center gap-1">
          <HighlighterIcon className="size-3" />
          Prose Syntax Analysis
        </h4>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-red-500">
            Adverbs: {analysis?.adverbPct}%
          </span>
          <span className="text-[10px] text-purple-500">
            Adjectives: {analysis?.adjPct}%
          </span>
          <button onClick={() => setActive(false)}>
            <XIcon className="size-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Color legend */}
      <div className="flex gap-3 text-[9px]">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-blue-500" /> Verbs
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-purple-500" /> Adjectives
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-red-500" /> Adverbs
        </span>
      </div>

      {/* Highlighted text preview (first 500 words) */}
      {analysis && (
        <div className="text-sm leading-relaxed font-serif max-h-48 overflow-y-auto">
          {analysis.categorized.slice(0, 500).map((w, i) => (
            <span key={i} className={CATEGORY_COLORS[w.category]}>
              {w.word}{" "}
            </span>
          ))}
          {analysis.categorized.length > 500 && (
            <span className="text-muted-foreground">... ({analysis.categorized.length - 500} more words)</span>
          )}
        </div>
      )}
    </div>
  );
}
