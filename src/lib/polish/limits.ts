/**
 * Polish Scene's limits and vocabulary, kept free of imports so the request
 * schema (read by client code too) can share them without pulling the prompt
 * builder into the browser bundle.
 */

export const POLISH_INTENSITIES = ["light", "bold"] as const;
export type PolishIntensity = (typeof POLISH_INTENSITIES)[number];

/** About 3,500 words: a long scene, and the most one reply can rewrite whole. */
export const POLISH_MAX_SELECTION_CHARS = 20_000;
/** How much of the chapter around the scene the model reads, each side. */
export const POLISH_CONTEXT_CHARS = 3_000;
export const POLISH_MAX_FOCUS_CHARS = 500;

export type PolishRejection = "truncated" | "empty" | "too-short" | "editorial-note";
