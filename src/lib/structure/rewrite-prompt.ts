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

/** A rewritten edge keeps roughly the edge's length. */
const HOOK_MIN_RATIO = 0.6;
const HOOK_MAX_RATIO = 1.6;
/** An edge kept whole and grown by this much is an extension, not a rewrite. */
const HOOK_APPEND_MIN_WORDS = 25;
const HOOK_APPEND_GROWTH = 1.05;

/** How close to its brief a draft must land. */
const TRIM_MUST_SHRINK = 0.98;
const TRIM_FLOOR_OF_TARGET = 0.6;
const EXPAND_MUST_GROW = 1.02;
const EXPAND_CEILING_OF_TARGET = 1.6;

export type RewriteRejection = "truncated" | "empty" | "off-target" | "editorial-note" | "reasoning-only";

const HOOK_BRIEF: Record<"opening" | "ending", string> = {
  opening: `HOOK: THE OPENING. Rewrite only this opening so the reader is inside the chapter from its first lines: begin in motion, in a concrete moment, or on a question the chapter goes on to answer. Cut throat-clearing and recap. Keep every event and fact the opening carries; the rest of the chapter continues from it unchanged.`,
  ending: `HOOK: THE ENDING. Rewrite only this ending so the reader turns the page: land on a turn, a decision, a revelation or an open question the story genuinely raises. Cut the winding down. Never resolve what the next chapters owe the reader, and never invent an event the story does not support; sharpen what is already there.`,
};

/** Said to every hook: an edge is rewritten in place, never extended. */
const HOOK_IN_PLACE = `Rewrite the passage itself: do not keep the passage and add to it, and do not continue past where it ends. The rewritten passage replaces the original exactly where it stands.`;

const BRIEF: Record<Exclude<RewriteKind, "hook">, string> = {
  trim: `TRIM. Cut this chapter toward the target length. Cut what the editor's instructions name first, then tighten what remains: repetition, restated information, over-long description, beats the reader already has. Keep every sentence that carries the story or the voice, and keep the writer's own sentences wherever they survive; this is a cut, not a paraphrase.`,
  expand: `EXPAND. Grow this chapter toward the target length by adding what the editor's instructions name: the missing beat, transition or scene, in the place they name. Keep every existing sentence that works, in its place. Add story, not padding: no extra adjectives, no restated feelings, no description for its own sake.`,
};

function cap(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n[...]` : text;
}

export interface RewritePromptInput {
  kind: RewriteKind;
  /** hook only. */
  scope?: "opening" | "ending";
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
    input.kind === "hook"
      ? `You are a developmental editor's ghostwriter revising one edge of a chapter of a novel. You return only that passage, revised, and nothing else.`
      : `You are a developmental editor's ghostwriter revising one chapter of a novel. You return the whole chapter, revised, and nothing else.`,
    input.kind === "hook" ? `${HOOK_BRIEF[input.scope ?? "ending"]}
${HOOK_IN_PLACE}` : BRIEF[input.kind],
    `## Rules
- Keep every name, place, date and fact exactly as written. Contradict nothing in the canon.
- Keep the point of view and the tense.
- Invent no new characters. An added beat uses the people and places the book already has.
- The chapter is Markdown, and your reply is Markdown too. Keep the formatting the chapter has, where it has it; never add italics or bold the writer did not use (a letter, a quote or a thought stays as plain as the writer left it). Keep every scene break line ("---" or "* * *") between the scenes it separates, and keep any heading.
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

/** The user turn for a hook: the edge to rewrite, with the chapter around it for context. */
export function buildHookUserContent(input: {
  scope: "opening" | "ending";
  segment: string;
  context: string;
  chapterNumber: number;
  title: string | null;
  instructions: string;
}): string {
  const heading = input.title ? `Chapter ${input.chapterNumber}: ${input.title}` : `Chapter ${input.chapterNumber}`;
  const where = input.scope === "opening" ? "what follows the opening" : "what comes before the ending";
  return [
    `${heading}. Rewrite its ${input.scope}.`,
    `The editor's instructions:\n${input.instructions.trim()}`,
    `For context only (do not rewrite or repeat it), ${where}:\n<context>\n${input.context}\n</context>`,
    `<passage>\n${input.segment}\n</passage>`,
    `Rewrite the passage between the <passage> tags and return only the rewritten passage.`,
  ].join("\n\n");
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
  if (ctx.kind === "hook") {
    // The live run kept the whole original ending and appended to it: that is
    // an extension, not the rewrite the move asked for.
    // Only a real passage kept whole at one end and grown past it counts: a
    // rewrite may build toward a short original line.
    const flat = (t: string) => t.replace(/\s+/g, " ").trim();
    const original = flat(ctx.original);
    const out = flat(text);
    const extended =
      ctx.originalWords >= HOOK_APPEND_MIN_WORDS &&
      (out.startsWith(original) || out.endsWith(original)) &&
      words > ctx.originalWords * HOOK_APPEND_GROWTH;
    if (extended) return { ok: false, reason: "off-target" };
    const fits = words >= ctx.originalWords * HOOK_MIN_RATIO && words <= ctx.originalWords * HOOK_MAX_RATIO;
    return fits ? { ok: true, text, words } : { ok: false, reason: "off-target" };
  }
  const onTarget =
    ctx.kind === "trim"
      ? words < ctx.originalWords * TRIM_MUST_SHRINK && words >= ctx.targetWords * TRIM_FLOOR_OF_TARGET
      : words > ctx.originalWords * EXPAND_MUST_GROW && words <= ctx.targetWords * EXPAND_CEILING_OF_TARGET;
  if (!onTarget) return { ok: false, reason: "off-target" };
  return { ok: true, text, words };
}
