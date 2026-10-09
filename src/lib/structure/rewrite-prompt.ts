/**
 * Dev editor v2, phase B — the ghostwriter's brief for a trim or an expansion
 * of one chapter, and the judge of what comes back.
 *
 * The draft replaces a whole chapter when the writer applies it, so this is
 * where the prose is protected, as in Polish Scene: the fingerprint and story
 * bible go in, and a reply that is cut off, gutted, padded or annotated never
 * becomes a draft.
 */

import { getAiTellGuidance } from "@/lib/agents/ai-tells";
import { buildLanguageDirective } from "@/lib/agents/language-directive";
import { addedEditorialNote } from "@/lib/editorial/finding-applicability";
import { estimatePolishTokens } from "@/lib/polish/limits";
import { countWords } from "@/lib/utils";
import type { RewriteKind } from "./moves";

const FINGERPRINT_CAP = 8_000;
const STORY_BIBLE_CAP = 12_000;
/** The most output one chapter rewrite may ask for, before the model's ceiling. */
export const REWRITE_MAX_OUTPUT_TOKENS = 24_000;
const REASONING_HEADROOM_TOKENS = 8_000;
const PREAMBLE_TOKENS = 512;
/** Room above the target: models overshoot, and a cut-off draft is useless. */
const TARGET_GROWTH = 1.3;

/** How close to its brief a draft must land. */
const TRIM_MUST_SHRINK = 0.98;
const TRIM_FLOOR_OF_TARGET = 0.6;
const EXPAND_MUST_GROW = 1.02;
const EXPAND_CEILING_OF_TARGET = 1.6;

export type RewriteRejection = "truncated" | "empty" | "off-target" | "editorial-note" | "reasoning-only";

const BRIEF: Record<RewriteKind, string> = {
  trim: `TRIM. Cut this chapter toward the target length. Cut what the editor's instructions name first, then tighten what remains: repetition, restated information, over-long description, beats the reader already has. Keep every sentence that carries the story or the voice, and keep the writer's own sentences wherever they survive; this is a cut, not a paraphrase.`,
  expand: `EXPAND. Grow this chapter toward the target length by adding what the editor's instructions name: the missing beat, transition or scene, in the place they name. Keep every existing sentence that works, in its place. Add story, not padding: no extra adjectives, no restated feelings, no description for its own sake.`,
};

function cap(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n[...]` : text;
}

export interface RewritePromptInput {
  kind: RewriteKind;
  language: string | null | undefined;
  fingerprint: string | null;
  storyBible: string | null;
}

export function buildRewriteSystemPrompt(input: RewritePromptInput): string {
  const voice = input.fingerprint?.trim()
    ? `## The writer's voice (style fingerprint)
Every sentence you write or keep must read as this writer, not as you.
${cap(input.fingerprint.trim(), FINGERPRINT_CAP)}`
    : `## The writer's voice
No style fingerprint exists yet. Match the chapter's own voice: point of view, tense, register and sentence habits.`;

  const canon = input.storyBible?.trim()
    ? `## Canon (story bible)
Names, places, relationships and facts below are fixed.
${cap(input.storyBible.trim(), STORY_BIBLE_CAP)}`
    : "";

  return [
    `You are a developmental editor's ghostwriter revising one chapter of a novel. You return the whole chapter, revised, and nothing else.`,
    BRIEF[input.kind],
    `## Rules
- Keep every name, place, date and fact exactly as written. Contradict nothing in the canon.
- Keep the point of view and the tense.
- Invent no new characters. An added beat uses the people and places the book already has.
- The chapter is Markdown, and your reply is Markdown too. Keep *italics* and **bold** where the meaning needs them. Keep every scene break line ("---" or "* * *") between the scenes it separates, and keep any heading.
- Never add notes, comments or instructions to the writer. No square brackets, no "Note:", no explanation before or after the prose.
- Separate paragraphs with one blank line.`,
    voice,
    canon,
    getAiTellGuidance(input.language ?? "en"),
    buildLanguageDirective(input.language).trim(),
    `Reply with the revised chapter only.`,
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export interface RewriteUserInput {
  chapterText: string;
  chapterNumber: number;
  title: string | null;
  currentWords: number;
  targetWords: number;
  instructions: string;
}

export function buildRewriteUserContent(input: RewriteUserInput): string {
  const heading = input.title ? `Chapter ${input.chapterNumber}: ${input.title}` : `Chapter ${input.chapterNumber}`;
  return [
    `${heading}. It has ${input.currentWords} words; the target is about ${input.targetWords} words.`,
    `The editor's instructions:\n${input.instructions.trim()}`,
    `<chapter>\n${input.chapterText}\n</chapter>`,
    `Revise the chapter between the <chapter> tags.`,
  ].join("\n\n");
}

interface BudgetInput {
  kind: RewriteKind;
  targetWords: number;
  reasoning?: boolean;
}

function draftTokens(text: string, input: BudgetInput): number {
  const words = Math.max(1, countWords(text));
  const growth = Math.max(1, input.targetWords / words) * TARGET_GROWTH;
  return Math.ceil(estimatePolishTokens(text) * growth) + PREAMBLE_TOKENS;
}

/** Output budget for one draft, plus thinking headroom for a reasoning model. */
export function rewriteMaxTokens(text: string, input: BudgetInput): number {
  const draft = Math.min(REWRITE_MAX_OUTPUT_TOKENS, draftTokens(text, input));
  return draft + (input.reasoning ? REASONING_HEADROOM_TOKENS : 0);
}

/** Whether one reply can hold the whole revised chapter. */
export function rewriteFitsBudget(text: string, input: BudgetInput): boolean {
  return draftTokens(text, input) <= REWRITE_MAX_OUTPUT_TOKENS;
}

export type RewriteSettlement =
  | { ok: true; text: string; words: number }
  | { ok: false; reason: RewriteRejection };

function stripFence(text: string): string {
  return text
    .replace(/^```[a-z]*\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/, "")
    .trim();
}

/** Judge one reply: a draft fit to replace the chapter, or why not. */
export function settleRewrite(
  raw: string,
  stopReason: string | null | undefined,
  ctx: { kind: RewriteKind; original: string; originalWords: number; targetWords: number }
): RewriteSettlement {
  if (stopReason === "max_tokens") return { ok: false, reason: "truncated" };
  const text = stripFence(raw.replace(/\r\n/g, "\n"));
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (addedEditorialNote(ctx.original, text)) return { ok: false, reason: "editorial-note" };

  const words = countWords(text);
  const onTarget =
    ctx.kind === "trim"
      ? words < ctx.originalWords * TRIM_MUST_SHRINK && words >= ctx.targetWords * TRIM_FLOOR_OF_TARGET
      : words > ctx.originalWords * EXPAND_MUST_GROW && words <= ctx.targetWords * EXPAND_CEILING_OF_TARGET;
  if (!onTarget) return { ok: false, reason: "off-target" };
  return { ok: true, text, words };
}
