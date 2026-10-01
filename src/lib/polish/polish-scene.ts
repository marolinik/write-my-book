/**
 * Polish Scene: the writer selects a whole scene and gets two rewrites of it,
 * a light one and a bold one, written in their voice and inside their canon.
 *
 * The chosen version replaces the selection with one click, so this module is
 * where the writer's prose is protected. The fingerprint and the story bible go
 * into the prompt; a cut-off, gutted or annotated reply never comes out.
 */

import { getAiTellGuidance } from "@/lib/agents/ai-tells";
import { buildLanguageDirective } from "@/lib/agents/language-directive";
import { addedEditorialNote } from "@/lib/editorial/finding-applicability";
import {
  POLISH_MAX_OUTPUT_TOKENS,
  polishRewriteTokens,
  type PolishIntensity,
  type PolishRejection,
} from "./limits";

export * from "./limits";

const FINGERPRINT_CAP = 8_000;
const STORY_BIBLE_CAP = 12_000;
/** Thinking a reasoning model does before it writes; not every route can switch it off. */
const REASONING_HEADROOM_TOKENS = 8_000;
/** A rewrite under this share of the original is a summary, not a polish. */
const MIN_LENGTH_RATIO = 0.4;

const INTENSITY_BRIEF: Record<PolishIntensity, string> = {
  light: `LIGHT POLISH. Keep the writer's sentences wherever they already work. Fix what slows or blurs the reading: unclear antecedents, tangled syntax, flat or repeated verbs, filter words, clumsy rhythm, dialogue tags that get in the way. A reader of both versions should recognise most sentences.`,
  bold: `BOLD POLISH. Rewrite with more literary ambition: sharper concrete images, stronger verbs, more subtext in the dialogue, varied sentence rhythm that follows the emotional beat, and endings of paragraphs that land. You may restructure sentences and paragraphs freely, but every event and every line of meaning in the scene survives.`,
};

function cap(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n[...]` : text;
}

export interface PolishPromptInput {
  intensity: PolishIntensity;
  language: string | null | undefined;
  fingerprint: string | null;
  storyBible: string | null;
}

export function buildPolishSystemPrompt(input: PolishPromptInput): string {
  const voice = input.fingerprint?.trim()
    ? `## The writer's voice (style fingerprint)
Your rewrite must read as this writer at their best, not as you.
${cap(input.fingerprint.trim(), FINGERPRINT_CAP)}`
    : `## The writer's voice
No style fingerprint exists yet. Match the voice of the selected text and the surrounding chapter: its point of view, tense, register and sentence habits.`;

  const canon = input.storyBible?.trim()
    ? `## Canon (story bible)
Names, places, relationships and facts below are fixed.
${cap(input.storyBible.trim(), STORY_BIBLE_CAP)}`
    : "";

  return [
    `You are a literary prose editor polishing one scene of a novel. You return the scene rewritten, nothing else.`,
    INTENSITY_BRIEF[input.intensity],
    `## Rules
- Do not change what happens: the same events in the same order, the same characters present, the same information revealed to the reader.
- Keep every name, place, date and fact exactly as written. Invent no new characters, backstory or plot.
- Keep the point of view and the tense.
- Keep dialogue saying the same thing; you may make it sound better.
- The scene is Markdown, and your reply is Markdown too. Keep *italics* and **bold** where the meaning needs them (thoughts, emphasis, titles). Keep every scene break line ("---" or "* * *") exactly where it stands, and keep any heading or list as it is.
- Never add notes, comments or instructions to the writer. No square brackets, no "Note:", no explanation before or after the prose.
- Separate paragraphs with one blank line.`,
    voice,
    canon,
    getAiTellGuidance(input.language ?? "en"),
    buildLanguageDirective(input.language).trim(),
    `Reply with the rewritten scene only.`,
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export interface PolishUserInput {
  selectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  focus?: string;
}

export function buildPolishUserContent(input: PolishUserInput): string {
  const parts: string[] = [];
  if (input.contextBefore?.trim()) {
    parts.push(`<text_before_scene>\n${input.contextBefore}\n</text_before_scene>`);
  }
  parts.push(`<scene>\n${input.selectedText}\n</scene>`);
  if (input.contextAfter?.trim()) {
    parts.push(`<text_after_scene>\n${input.contextAfter}\n</text_after_scene>`);
  }
  if (input.focus?.trim()) {
    parts.push(`The writer asks you to focus on: "${input.focus.trim()}"`);
  }
  parts.push(`Rewrite the scene between the <scene> tags.`);
  return parts.join("\n\n");
}

/**
 * Output budget for one rewrite: the scene's token cost in its own script,
 * with room to grow, plus thinking headroom for a reasoning model. The route
 * clamps it to the model's ceiling.
 */
export function polishMaxTokens(
  selectedText: string,
  options: { reasoning?: boolean } = {}
): number {
  const rewrite = Math.min(POLISH_MAX_OUTPUT_TOKENS, polishRewriteTokens(selectedText));
  return rewrite + (options.reasoning ? REASONING_HEADROOM_TOKENS : 0);
}

export type PolishSettlement =
  | { ok: true; text: string }
  | { ok: false; reason: PolishRejection };

function stripFence(text: string): string {
  return text
    .replace(/^```[a-z]*\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/, "")
    .trim();
}

/** Judge one model reply: either prose fit to replace the scene, or why not. */
export function settlePolishedText(
  raw: string,
  stopReason: string | null | undefined,
  originalText: string
): PolishSettlement {
  if (stopReason === "max_tokens") return { ok: false, reason: "truncated" };
  const text = stripFence(raw.replace(/\r\n/g, "\n"));
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (text.length < originalText.trim().length * MIN_LENGTH_RATIO) {
    return { ok: false, reason: "too-short" };
  }
  if (addedEditorialNote(originalText, text)) return { ok: false, reason: "editorial-note" };
  return { ok: true, text };
}
